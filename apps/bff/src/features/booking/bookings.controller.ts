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
import { CurrentUser, CurrentUserPayload } from '../../shared/decorators/current-user.decorator';
import { Public } from '../../shared/decorators/public.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { withPublicTenant } from '../../shared/http/public-tenant';
import { AppLogger } from '../../shared/observability/app-logger';
import {
  BookingResponse,
  BookingListResponse,
  BookingDetailResponse,
  CancelBookingResponse,
  CompleteBookingResponse,
  RescheduleBookingResponse,
} from './bookings.types';
import {
  CustomerBookingDetailResponse,
  CustomerBookingListResponse,
  StaffBookingDetailResponse,
  StaffBookingListResponse,
} from '@ikaro/types';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import {
  toBookingListResponse,
  toCustomerBookingDetail,
  toStaffBookingDetail,
} from './bookings.mapper';
import { buildBookingListParams, isStaffOrManagerRole } from './bookings-list-query.util';
import { fetchLoyaltyBalanceForStaffBookingDetail } from './booking-staff-loyalty-balance.util';
import {
  ApproveBookingBody,
  ApproveBookingBodySchema,
  AuthenticatedBookingBody,
  AuthenticatedBookingBodySchema,
  CancelAsAdminBody,
  CancelAsAdminBodySchema,
  CompleteBookingBody,
  CompleteBookingBodySchema,
  RejectBookingBody,
  RejectBookingBodySchema,
  RequestBookingBody,
  RequestBookingBodySchema,
  RequestMoreInfoBody,
  RequestMoreInfoBodySchema,
  RescheduleBookingBody,
  RescheduleBookingBodySchema,
  StaffListBookingsQuery,
  StaffListBookingsQuerySchema,
  SubmitBookingInfoBody,
  SubmitBookingInfoBodySchema,
} from './bookings.schemas';

// Request/query Zod schemas moved to bookings.schemas.ts to keep this file under the
// file-length cap — re-exported here so existing imports of these symbols from this file keep
// working unchanged. The attachment-upload and guest-token-gated endpoints moved to
// bookings-attachments.controller.ts and bookings-guest.controller.ts for the same reason —
// same @Controller('bookings') base and routes, no URL changes; both registered alongside this
// controller in bookings.module.ts.
export * from './bookings.schemas';

@Controller('bookings')
export class BookingsController {
  private readonly logger = new AppLogger(BookingsController.name);

  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  @Roles('CUSTOMER', 'MANAGER', 'STAFF')
  async list(
    @Query(new ZodValidationPipe(StaffListBookingsQuerySchema)) query: StaffListBookingsQuery,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<StaffBookingListResponse | CustomerBookingListResponse> {
    const params = buildBookingListParams(query);

    const backend = await this.backendHttp.get<BookingListResponse>('/bookings', params);

    return toBookingListResponse(backend, query, isStaffOrManagerRole(user.role));
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
      detail.customerId === null
        ? null
        : await fetchLoyaltyBalanceForStaffBookingDetail(
            this.backendHttp,
            this.logger,
            detail.customerId,
          );

    return toStaffBookingDetail(detail, loyaltyBalance);
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
}
