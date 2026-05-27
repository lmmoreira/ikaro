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
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';
import { ConfigService } from '@nestjs/config';
import { Public } from '../shared/decorators/public.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { TenantInfoResponse } from '../shared/types/backend-responses';
import {
  BookingResponse,
  BookingListResponse,
  BookingDetailResponse,
  CancelBookingResponse,
} from './bookings.types';

const AddressSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zipCode: z.string().regex(/^\d{8}$/, 'zipCode must be 8 digits'),
});

export const RequestBookingBodySchema = z.object({
  guestEmail: z.email(),
  guestName: z.string().min(1),
  guestPhone: z.string().refine((v) => {
    const d = v.replace(/\D/g, '');
    return d.length === 10 || d.length === 11;
  }, 'guestPhone must have 10 or 11 digits'),
  guestAddress: AddressSchema.optional(),
  pickupAddress: AddressSchema.optional(),
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1),
  beforeServicePhotoUrls: z.array(z.url()).optional(),
});

export const AuthenticatedBookingBodySchema = z.object({
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1),
  pickupAddress: AddressSchema.optional(),
  beforeServicePhotoUrls: z.array(z.url()).optional(),
});

export const RejectBookingBodySchema = z.object({
  reason: z.string().trim().min(10),
});

export const RequestMoreInfoBodySchema = z.object({
  message: z.string().trim().min(20),
});

export const SubmitBookingInfoBodySchema = z.object({
  response: z.string().trim().min(1),
  photoUrls: z.array(z.url()).optional(),
});

export const SubmitGuestBookingInfoBodySchema = z.object({
  response: z.string().trim().min(1),
  photoUrls: z.array(z.url()).optional(),
});

const BookingStatusEnum = z.enum([
  'PENDING',
  'INFO_REQUESTED',
  'APPROVED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
]);

const ListBookingsQuerySchema = z.object({
  status: BookingStatusEnum.optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

type ListBookingsQuery = z.infer<typeof ListBookingsQuerySchema>;

const GuestTokenPayloadSchema = z.object({
  bookingId: z.string(),
  tenantId: z.string(),
  guestEmail: z.email(),
});

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

  @Get()
  @Roles('CUSTOMER', 'MANAGER', 'STAFF')
  list(
    @Query(new ZodValidationPipe(ListBookingsQuerySchema)) query: ListBookingsQuery,
  ): Promise<BookingListResponse> {
    return this.backendHttp.get<BookingListResponse>('/bookings', query);
  }

  @Get(':id')
  @Roles('CUSTOMER', 'MANAGER', 'STAFF')
  getOne(@Param('id', ParseUUIDPipe) id: string): Promise<BookingDetailResponse> {
    return this.backendHttp.get<BookingDetailResponse>(`/bookings/${id}`);
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
  @Roles('CUSTOMER')
  cancelAsCustomer(@Param('id') id: string): Promise<CancelBookingResponse> {
    return this.backendHttp.patch(`/bookings/${id}/cancel-customer`, {});
  }

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER', 'STAFF')
  approve(
    @Param('id') id: string,
  ): Promise<{ bookingId: string; status: string; approvedAt: string }> {
    return this.backendHttp.patch(`/bookings/${id}/approve`, {});
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

    let rawPayload: unknown;
    try {
      rawPayload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch {
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

    const payloadResult = GuestTokenPayloadSchema.safeParse(rawPayload);
    if (!payloadResult.success) {
      throw new HttpException(
        {
          type: 'about:blank',
          title: 'Bad Request',
          status: HttpStatus.BAD_REQUEST,
          detail: 'Guest token payload is malformed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const payload = payloadResult.data;

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
      { guestEmail: payload.guestEmail, ...body },
      payload.tenantId,
    );
  }
}
