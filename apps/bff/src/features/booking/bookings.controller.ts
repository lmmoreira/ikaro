import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, CurrentUserPayload } from '../../shared/decorators/current-user.decorator';
import { z } from 'zod';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../shared/decorators/public.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { withPublicTenant } from '../../shared/http/public-tenant';
import { throwProblemDetail } from '../../shared/http/problem-detail';
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
  ApproveBookingRequest,
  BffErrorCode,
  CustomerBookingDetailResponse,
  CustomerBookingListResponse,
  GenericErrorCode,
  GuestBookingReadResponse,
  PhoneErrorCode,
  StaffBookingDetailResponse,
  StaffBookingListResponse,
} from '@ikaro/types';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import {
  toCustomerBookingDetail,
  toCustomerBookingListItem,
  toGuestBookingRead,
  toStaffBookingCard,
  toStaffBookingDetail,
} from './bookings.mapper';
import { GuestTokenPayload, tryDecodeRawJwt, verifyGuestToken } from './guest-token.util';
import { buildBookingListParams, isStaffOrManagerRole } from './bookings-list-query.util';

// Required-field checks are deliberately NOT duplicated here (TD23-S13) — the backend's
// Address.create() already validates street/number/city/state/zipCode required-ness via
// requireField(), throwing a single-cause { code, field: 'pickupAddress'|'contactAddress',
// params: { field } } that's strictly more granular than a Zod violations[] array could be for
// this shape. Duplicating the check here only produced a second, incompatible error shape for
// the same failure (see td/TD11-BFF-BACKEND-VALIDATION-SCHEMA-DUPLICATION.md).
const AddressSchema = z.object({
  street: z.string(),
  number: z.string(),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().min(1).optional(),
  city: z.string(),
  state: z.string().trim().max(10),
  zipCode: z.string().trim().max(20),
});

// Uploads always target tmp/ staging (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md) — promotion to
// tenants/<id>/bookings/<bookingId>/... happens server-side once the booking is saved.
const TMP_PHOTO_PATH_REGEX = /^tmp\/[^/]+\/[^/]+\/.+$/;

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export const RequestBookingBodySchema = z.object({
  contactEmail: z.email(),
  contactName: z.string().min(1),
  contactPhone: z.string().refine((v) => E164_PATTERN.test(v), {
    error: 'contactPhone must be in E.164 format',
    params: { code: PhoneErrorCode.FORMAT_INVALID },
  }),
  contactAddress: AddressSchema.optional(),
  pickupAddress: AddressSchema.optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1),
  beforeServicePhotoUrls: z.array(z.string().regex(TMP_PHOTO_PATH_REGEX)).optional(),
});

export const AuthenticatedBookingBodySchema = z.object({
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1),
  pickupAddress: AddressSchema.optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  beforeServicePhotoUrls: z.array(z.string().regex(TMP_PHOTO_PATH_REGEX)).optional(),
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

export const ApproveBookingBodySchema = z
  .object({
    scheduledAt: z.iso.datetime().optional(),
  })
  .default({});

export const CompleteBookingBodySchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.uuid(),
        actualPriceCharged: z.number().nonnegative(),
      }),
    )
    .min(1),
  afterServicePhotoUrls: z.array(z.string().regex(TMP_PHOTO_PATH_REGEX)).optional().default([]),
  adminNotes: z.string().trim().min(1).max(500).optional(),
  discountByPoints: z
    .object({
      pointsUsed: z.number().int().positive(),
      amountDeducted: z.number().positive(),
    })
    .optional(),
});

type CancelAsAdminBody = z.infer<typeof CancelAsAdminBodySchema>;
type RescheduleBookingBody = z.infer<typeof RescheduleBookingBodySchema>;
type ApproveBookingBody = ApproveBookingRequest;
type CompleteBookingBody = z.infer<typeof CompleteBookingBodySchema>;

export const RequestMoreInfoBodySchema = z.object({
  message: z.string().trim().min(20),
});

export const SubmitBookingInfoBodySchema = z.object({
  response: z.string().trim().min(1),
  photoUrls: z.array(z.string().regex(TMP_PHOTO_PATH_REGEX)).optional(),
});

export const SubmitGuestBookingInfoBodySchema = z.object({
  response: z.string().trim().min(1),
  photoUrls: z.array(z.string().regex(TMP_PHOTO_PATH_REGEX)).optional(),
});

// Matches one or more comma-separated BookingStatus values, e.g. "PENDING" or "PENDING,INFO_REQUESTED"
const BOOKING_STATUS_RE =
  /^(PENDING|INFO_REQUESTED|APPROVED|COMPLETED|REJECTED|CANCELLED)(,(PENDING|INFO_REQUESTED|APPROVED|COMPLETED|REJECTED|CANCELLED))*$/;

const StaffListBookingsQuerySchema = z
  .object({
    status: z.string().regex(BOOKING_STATUS_RE).optional().default('PENDING,INFO_REQUESTED'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((q) => q.to === undefined || q.from !== undefined, {
    path: ['to'],
    error: '`to` requires `from`',
    params: { code: GenericErrorCode.VALUE_INVALID },
  });

type StaffListBookingsQuery = z.infer<typeof StaffListBookingsQuerySchema>;

export const AttachmentSignedUrlBodySchema = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine((v) => !v.includes('/') && !v.includes('..'), {
      error: 'fileName must not contain path separators or ".."',
      params: { code: GenericErrorCode.FORMAT_INVALID },
    }),
  contentType: z.enum(['image/jpeg', 'image/png']),
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
      .object({
        sub: z.string(),
        tenantId: z.string(),
        tenantSlug: z.string(),
        tenantName: z.string().default(''),
        userName: z.string().nullable().default(null),
        role: z.string(),
        locale: z.string().default('pt-BR'),
      })
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

    // Scenario 1 (CUSTOMER) or Scenario 4 (STAFF/MANAGER) — JWT identifies the tenant.
    // Must use postForPublic because this route is @Public() — JwtAuthGuard does not run,
    // so req.user is unset and post() would send an empty X-Tenant-ID header.
    // Uploads always target tmp/ staging now (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md) — a
    // bookingId is no longer needed at upload time, only tenant resolution is.
    if (user) {
      return this.backendHttp.postForPublic<AttachmentSignedUrlResponse>(
        '/bookings/attachments/signed-url',
        { fileName: body.fileName, contentType: body.contentType },
        user.tenantId,
      );
    }

    // Scenario 3 — guest with guestToken, tenant resolved from the token
    if (body.guestToken) {
      const secret = this.config.getOrThrow<string>('JWT_SECRET');
      const tokenPayload = verifyGuestToken(body.guestToken, secret);
      if (!tokenPayload) {
        throw throwProblemDetail(
          HttpStatus.UNAUTHORIZED,
          BffErrorCode.GUEST_TOKEN_INVALID,
          'Invalid or expired guest token',
        );
      }
      return this.backendHttp.postForPublic<AttachmentSignedUrlResponse>(
        '/bookings/attachments/signed-url',
        { fileName: body.fileName, contentType: body.contentType },
        tokenPayload.tenantId,
      );
    }

    // Scenario 2 — anonymous guest, tenantSlug in body
    return withPublicTenant(this.backendHttp, body.tenantSlug, (tenantId) =>
      this.backendHttp.postForPublic<AttachmentSignedUrlResponse>(
        '/bookings/attachments/signed-url',
        { fileName: body.fileName, contentType: body.contentType },
        tenantId,
      ),
    );
  }

  @Get()
  @Roles('CUSTOMER', 'MANAGER', 'STAFF')
  async list(
    @Query(new ZodValidationPipe(StaffListBookingsQuerySchema)) query: StaffListBookingsQuery,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<StaffBookingListResponse | CustomerBookingListResponse> {
    const params = buildBookingListParams(query);

    const backend = await this.backendHttp.get<BookingListResponse>('/bookings', params);

    if (!isStaffOrManagerRole(user.role)) {
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
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CustomerBookingDetailResponse | StaffBookingDetailResponse> {
    const detail = await this.backendHttp.get<BookingDetailResponse>(`/bookings/${id}`);

    if (!isStaffOrManagerRole(user.role)) {
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
    return withPublicTenant(this.backendHttp, tenantSlug, (tenantId) =>
      this.backendHttp.postForPublic<BookingResponse>('/bookings', body, tenantId),
    );
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
    @Body(new ZodValidationPipe(ApproveBookingBodySchema)) body: ApproveBookingBody,
  ): Promise<{ bookingId: string; status: string; approvedAt: string }> {
    return this.backendHttp.patch(
      `/bookings/${id}/approve`,
      body.scheduledAt ? { scheduledAt: body.scheduledAt } : {},
    );
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
    @Param('id', CanonicalParseUUIDPipe) id: string,
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
    const payload = this.verifyGuestTokenOrThrow(id, token);

    return this.backendHttp.patchForPublic(
      `/bookings/${id}/submit-info/guest`,
      { contactEmail: payload.contactEmail, ...body },
      payload.tenantId,
    );
  }

  @Get(':id/guest')
  @Public()
  async getOneGuest(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
  ): Promise<GuestBookingReadResponse> {
    const payload = this.verifyGuestTokenOrThrow(id, token);

    const detail = await this.backendHttp.getForPublic<BookingDetailResponse>(
      `/bookings/${id}`,
      payload.tenantId,
    );

    if (detail.status !== 'INFO_REQUESTED') {
      throw throwProblemDetail(
        HttpStatus.CONFLICT,
        BffErrorCode.GUEST_BOOKING_NOT_AWAITING_INFO,
        'Booking is no longer awaiting additional information',
      );
    }

    return toGuestBookingRead(detail);
  }

  private verifyGuestTokenOrThrow(id: string, token: string | undefined): GuestTokenPayload {
    if (!token) {
      throw throwProblemDetail(
        HttpStatus.BAD_REQUEST,
        BffErrorCode.GUEST_TOKEN_MISSING,
        'token query parameter is required',
      );
    }

    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const payload = verifyGuestToken(token, secret);
    if (!payload) {
      throw throwProblemDetail(
        HttpStatus.UNAUTHORIZED,
        BffErrorCode.GUEST_TOKEN_INVALID,
        'Invalid or expired guest token',
      );
    }

    if (payload.bookingId !== id) {
      throw throwProblemDetail(
        HttpStatus.BAD_REQUEST,
        BffErrorCode.GUEST_TOKEN_BOOKING_MISMATCH,
        'Token bookingId does not match route',
      );
    }

    return payload;
  }
}
