import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, CurrentUserPayload } from '../shared/decorators/current-user.decorator';
import { z } from 'zod';
import { ConfigService } from '@nestjs/config';
import { Public } from '../shared/decorators/public.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { TenantInfoResponse } from '../shared/types/backend-responses';
import {
  AttachmentSignedUrlResponse,
  BookingResponse,
  BookingListResponse,
  BookingDetailResponse,
  CancelBookingResponse,
  CompleteBookingResponse,
  RescheduleBookingResponse,
} from './bookings.types';
import { LoyaltyBalanceResponse } from '../loyalty/loyalty.types';
import {
  CustomerBookingDetailResponse,
  CustomerBookingListResponse,
  StaffBookingDetailResponse,
  StaffBookingListResponse,
} from '@ikaro/types';
import {
  toCustomerBookingDetail,
  toCustomerBookingListItem,
  toStaffBookingCard,
  toStaffBookingDetail,
} from './bookings.mapper';
import { tryDecodeRawJwt, verifyGuestToken } from './guest-token.util';

const AddressSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().min(1).optional(),
  city: z.string().min(1),
  state: z.string().trim().min(1).max(10),
  zipCode: z.string().trim().min(1).max(20),
});

export const RequestBookingBodySchema = z.object({
  contactEmail: z.email(),
  contactName: z.string().min(1),
  contactPhone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'contactPhone must be in E.164 format'),
  contactAddress: AddressSchema.optional(),
  pickupAddress: AddressSchema.optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1),
  beforeServicePhotoUrls: z
    .array(z.string().regex(/^tenants\/[^/]+\/(uploads|bookings)\/[^/]+\/.+$/))
    .optional(),
});

export const AuthenticatedBookingBodySchema = z.object({
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1),
  pickupAddress: AddressSchema.optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  beforeServicePhotoUrls: z
    .array(z.string().regex(/^tenants\/[^/]+\/(uploads|bookings)\/[^/]+\/.+$/))
    .optional(),
});

export const RejectBookingBodySchema = z.object({
  reason: z.string().trim().min(10),
});

export const CancelAsAdminBodySchema = z
  .object({
    reason: z.string().min(1).optional(),
  })
  .default({});

export const RescheduleBookingBodySchema = z.object({
  scheduledAt: z.iso.datetime(),
  adminNotes: z.string().trim().min(1).max(500).optional(),
});

export const CompleteBookingBodySchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.uuid(),
        actualPriceCharged: z.number().nonnegative(),
      }),
    )
    .min(1),
  afterServicePhotoUrls: z
    .array(z.string().regex(/^tenants\/[^/]+\/bookings\/[^/]+\/.+$/))
    .optional()
    .default([]),
  adminNotes: z.string().trim().min(1).max(500).optional(),
});

type CancelAsAdminBody = z.infer<typeof CancelAsAdminBodySchema>;
type RescheduleBookingBody = z.infer<typeof RescheduleBookingBodySchema>;
type CompleteBookingBody = z.infer<typeof CompleteBookingBodySchema>;

export const RequestMoreInfoBodySchema = z.object({
  message: z.string().trim().min(20),
});

export const SubmitBookingInfoBodySchema = z.object({
  response: z.string().trim().min(1),
  photoUrls: z
    .array(z.string().regex(/^tenants\/[^/]+\/(uploads|bookings)\/[^/]+\/.+$/))
    .optional(),
});

export const SubmitGuestBookingInfoBodySchema = z.object({
  response: z.string().trim().min(1),
  photoUrls: z
    .array(z.string().regex(/^tenants\/[^/]+\/(uploads|bookings)\/[^/]+\/.+$/))
    .optional(),
});

// Matches one or more comma-separated BookingStatus values, e.g. "PENDING" or "PENDING,INFO_REQUESTED"
const BOOKING_STATUS_RE =
  /^(PENDING|INFO_REQUESTED|APPROVED|COMPLETED|REJECTED|CANCELLED)(,(PENDING|INFO_REQUESTED|APPROVED|COMPLETED|REJECTED|CANCELLED))*$/;

const StaffListBookingsQuerySchema = z.object({
  status: z.string().regex(BOOKING_STATUS_RE).optional().default('PENDING,INFO_REQUESTED'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

type StaffListBookingsQuery = z.infer<typeof StaffListBookingsQuerySchema>;

export const AttachmentSignedUrlBodySchema = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine((v) => !v.includes('/') && !v.includes('..'), {
      message: 'fileName must not contain path separators or ".."',
    }),
  contentType: z.enum(['image/jpeg', 'image/png']),
  bookingId: z.uuid().optional(),
  tenantSlug: z.string().optional(),
  guestToken: z.string().optional(),
});

type AttachmentSignedUrlBody = z.infer<typeof AttachmentSignedUrlBodySchema>;

type RequestBookingBody = z.infer<typeof RequestBookingBodySchema>;
type AuthenticatedBookingBody = z.infer<typeof AuthenticatedBookingBodySchema>;
type RejectBookingBody = z.infer<typeof RejectBookingBodySchema>;
type RequestMoreInfoBody = z.infer<typeof RequestMoreInfoBodySchema>;
type SubmitBookingInfoBody = z.infer<typeof SubmitBookingInfoBodySchema>;
type SubmitGuestBookingInfoBody = z.infer<typeof SubmitGuestBookingInfoBodySchema>;

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly backendHttp: BackendHttpService,
    private readonly config: ConfigService,
  ) {}

  private tryDecodeUserJwt(authHeader: string | undefined): CurrentUserPayload | null {
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const raw = tryDecodeRawJwt(token, secret);
    if (!raw) return null;
    const parsed = z
      .object({ sub: z.string(), tenantId: z.string(), tenantSlug: z.string(), role: z.string() })
      .safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  @Post('attachments/signed-url')
  @HttpCode(HttpStatus.CREATED)
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async generateAttachmentSignedUrl(
    @Headers('authorization') authHeader: string | undefined,
    @Body(new ZodValidationPipe(AttachmentSignedUrlBodySchema)) body: AttachmentSignedUrlBody,
  ): Promise<AttachmentSignedUrlResponse> {
    const user = this.tryDecodeUserJwt(authHeader);

    // Scenario 1 (CUSTOMER, no bookingId) or Scenario 4 (STAFF/MANAGER, bookingId present).
    // Must use postForPublic because this route is @Public() — JwtAuthGuard does not run,
    // so req.user is unset and post() would send an empty X-Tenant-ID header.
    if (user) {
      return this.backendHttp.postForPublic<AttachmentSignedUrlResponse>(
        '/bookings/attachments/signed-url',
        {
          fileName: body.fileName,
          contentType: body.contentType,
          bookingId: body.bookingId,
        },
        user.tenantId,
      );
    }

    // Scenario 3 — guest with guestToken + bookingId
    if (body.guestToken) {
      const secret = this.config.getOrThrow<string>('JWT_SECRET');
      const tokenPayload = verifyGuestToken(body.guestToken, secret);
      if (!tokenPayload) {
        throw new HttpException(
          {
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            detail: 'Invalid or expired guest token',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }
      return this.backendHttp.postForPublic<AttachmentSignedUrlResponse>(
        '/bookings/attachments/signed-url',
        {
          fileName: body.fileName,
          contentType: body.contentType,
          bookingId: tokenPayload.bookingId,
        },
        tokenPayload.tenantId,
      );
    }

    // Scenario 2 — anonymous guest, tenantSlug in body
    if (!body.tenantSlug) {
      throw new HttpException(
        {
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          detail: 'tenantSlug is required for guest uploads',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const tenant = await this.backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/by-slug/${body.tenantSlug}`,
    );
    return this.backendHttp.postForPublic<AttachmentSignedUrlResponse>(
      '/bookings/attachments/signed-url',
      { fileName: body.fileName, contentType: body.contentType },
      tenant.id,
    );
  }

  @Get()
  @Roles('CUSTOMER', 'MANAGER', 'STAFF')
  async list(
    @Query(new ZodValidationPipe(StaffListBookingsQuerySchema)) query: StaffListBookingsQuery,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<StaffBookingListResponse | CustomerBookingListResponse> {
    const params: Record<string, unknown> = {
      status: query.status,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    };

    if (query.date) {
      params.from = `${query.date}T00:00:00.000Z`;
      params.to = `${query.date}T23:59:59.999Z`;
    } else if (query.from) {
      params.from = `${query.from}T00:00:00.000Z`;
    }

    const backend = await this.backendHttp.get<BookingListResponse>('/bookings', params);

    if (user.role !== 'MANAGER' && user.role !== 'STAFF') {
      return {
        items: backend.items.map(toCustomerBookingListItem),
        total: backend.pagination.total,
        page: query.page,
        limit: query.limit,
      };
    }

    return {
      items: backend.items.map(toStaffBookingCard),
      total: backend.pagination.total,
      page: query.page,
      limit: query.limit,
    };
  }

  @Get(':id')
  @Roles('CUSTOMER', 'MANAGER', 'STAFF')
  async getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CustomerBookingDetailResponse | StaffBookingDetailResponse> {
    const detail = await this.backendHttp.get<BookingDetailResponse>(`/bookings/${id}`);

    if (user.role !== 'MANAGER' && user.role !== 'STAFF') {
      return toCustomerBookingDetail(detail);
    }

    const loyaltyBalance =
      detail.customerId === null ? null : await this.fetchLoyaltyBalance(detail.customerId);

    return toStaffBookingDetail(detail, loyaltyBalance);
  }

  private async fetchLoyaltyBalance(customerId: string): Promise<number | null> {
    try {
      const balance = await this.backendHttp.get<LoyaltyBalanceResponse>(
        `/customers/${customerId}/loyalty/balance`,
      );
      return balance.currentPoints;
    } catch {
      return null;
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Public()
  async create(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
    @Body(new ZodValidationPipe(RequestBookingBodySchema)) body: RequestBookingBody,
  ): Promise<BookingResponse> {
    if (!tenantSlug) {
      throw new HttpException(
        {
          type: 'about:blank',
          title: 'Bad Request',
          status: HttpStatus.BAD_REQUEST,
          detail: 'X-Tenant-Slug header is required',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const tenant = await this.backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/by-slug/${tenantSlug}`,
    );

    return this.backendHttp.postForPublic<BookingResponse>('/bookings', body, tenant.id);
  }

  @Post('authenticated')
  @HttpCode(HttpStatus.CREATED)
  @Roles('CUSTOMER')
  createAuthenticated(
    @Body(new ZodValidationPipe(AuthenticatedBookingBodySchema)) body: AuthenticatedBookingBody,
  ): Promise<BookingResponse> {
    return this.backendHttp.post<BookingResponse>('/bookings/authenticated', body);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('CUSTOMER', 'MANAGER', 'STAFF')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelAsAdminBodySchema)) body: CancelAsAdminBody,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CancelBookingResponse> {
    if (user.role === 'CUSTOMER') {
      return this.backendHttp.patch(`/bookings/${id}/cancel-customer`, {});
    }
    return this.backendHttp.patch(`/bookings/${id}/cancel-admin`, body);
  }

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER', 'STAFF')
  approve(
    @Param('id') id: string,
  ): Promise<{ bookingId: string; status: string; approvedAt: string }> {
    return this.backendHttp.patch(`/bookings/${id}/approve`, {});
  }

  @Patch(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER', 'STAFF')
  reschedule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RescheduleBookingBodySchema)) body: RescheduleBookingBody,
  ): Promise<RescheduleBookingResponse> {
    return this.backendHttp.patch(`/bookings/${id}/reschedule`, body);
  }

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER', 'STAFF')
  complete(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
    @Body(new ZodValidationPipe(CompleteBookingBodySchema)) body: CompleteBookingBody,
  ): Promise<CompleteBookingResponse> {
    return this.backendHttp.patch(`/bookings/${id}/complete`, body);
  }

  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER', 'STAFF')
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RejectBookingBodySchema)) body: RejectBookingBody,
  ): Promise<{ bookingId: string; status: string; rejectedAt: string }> {
    return this.backendHttp.patch(`/bookings/${id}/reject`, body);
  }

  @Patch(':id/request-info')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER', 'STAFF')
  requestInfo(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RequestMoreInfoBodySchema)) body: RequestMoreInfoBody,
  ): Promise<{ bookingId: string; status: string; infoRequestedAt: string }> {
    return this.backendHttp.patch(`/bookings/${id}/request-info`, body);
  }

  @Patch(':id/submit-info')
  @HttpCode(HttpStatus.OK)
  @Roles('CUSTOMER')
  submitInfo(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SubmitBookingInfoBodySchema)) body: SubmitBookingInfoBody,
  ): Promise<{ bookingId: string; status: string; infoSubmittedAt: string }> {
    return this.backendHttp.patch(`/bookings/${id}/submit-info`, body);
  }

  @Patch(':id/submit-info/guest')
  @HttpCode(HttpStatus.OK)
  @Public()
  async submitInfoGuest(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Body(new ZodValidationPipe(SubmitGuestBookingInfoBodySchema)) body: SubmitGuestBookingInfoBody,
  ): Promise<{ bookingId: string; status: string; infoSubmittedAt: string }> {
    if (!token) {
      throw new HttpException(
        {
          type: 'about:blank',
          title: 'Bad Request',
          status: HttpStatus.BAD_REQUEST,
          detail: 'token query parameter is required',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const payload = verifyGuestToken(token, secret);
    if (!payload) {
      throw new HttpException(
        {
          type: 'about:blank',
          title: 'Unauthorized',
          status: HttpStatus.UNAUTHORIZED,
          detail: 'Invalid or expired guest token',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (payload.bookingId !== id) {
      throw new HttpException(
        {
          type: 'about:blank',
          title: 'Bad Request',
          status: HttpStatus.BAD_REQUEST,
          detail: 'Token bookingId does not match route',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.backendHttp.patchForPublic(
      `/bookings/${id}/submit-info/guest`,
      { contactEmail: payload.contactEmail, ...body },
      payload.tenantId,
    );
  }
}
