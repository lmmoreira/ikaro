import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  CreateBookingByStaffDto,
  CreateBookingByStaffSchema,
} from '../../application/dtos/create-booking-by-staff.dto';
import {
  RequestBookingDto,
  RequestBookingSchema,
} from '../../application/dtos/request-booking.dto';
import {
  RequestAuthenticatedBookingDto,
  RequestAuthenticatedBookingSchema,
} from '../../application/dtos/request-authenticated-booking.dto';
import {
  RequestBookingUseCase,
  RequestBookingUseCaseResult,
} from '../../application/use-cases/request-booking.use-case';
import {
  RequestAuthenticatedBookingUseCase,
  RequestAuthenticatedBookingUseCaseResult,
} from '../../application/use-cases/request-authenticated-booking.use-case';
import {
  CreateBookingByStaffUseCase,
  CreateBookingByStaffUseCaseResult,
} from '../../application/use-cases/create-booking-by-staff.use-case';
import { ListBookingsDto, ListBookingsSchema } from '../../application/dtos/list-bookings.dto';
import {
  ListBookingsUseCase,
  ListBookingsUseCaseResult,
} from '../../application/use-cases/list-bookings.use-case';
import {
  GetBookingByIdUseCase,
  GetBookingByIdUseCaseResult,
} from '../../application/use-cases/get-booking-by-id.use-case';
import { TenantBookingWindow } from '../../application/use-cases/booking-window.helpers';
import { mapBookingError } from '../http/booking-error.mapper';

// Split from the lifecycle-transition endpoints (approve/reject/cancel/reschedule/complete/...)
// — see booking-lifecycle.controller.ts, same 'bookings' route prefix — to satisfy
// docs/CODE_STANDARDS.md's file-length limit. This controller keeps read + creation only.
@Controller('bookings')
export class BookingController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly requestBooking: RequestBookingUseCase,
    private readonly requestAuthenticatedBooking: RequestAuthenticatedBookingUseCase,
    private readonly createBookingByStaff: CreateBookingByStaffUseCase,
    private readonly listBookings: ListBookingsUseCase,
    private readonly getBooking: GetBookingByIdUseCase,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListBookingsSchema)) query: ListBookingsDto,
  ): Promise<ListBookingsUseCaseResult> {
    const { tenantId, actorType, actorId, settings } = this.ctx;
    return this.listBookings
      .execute({
        ...query,
        tenantId,
        customerId: actorType === 'CUSTOMER' ? actorId : undefined,
        cancellationWindowHours: settings.booking.cancellationWindowHours,
        timezone: settings.businessHours.timezone,
      })
      .catch(mapBookingError);
  }

  @Get(':id')
  getOne(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<GetBookingByIdUseCaseResult> {
    const { tenantId, actorType, actorId, settings } = this.ctx;
    return this.getBooking
      .execute({
        bookingId: id,
        tenantId,
        cancellationWindowHours: settings.booking.cancellationWindowHours,
        requestingCustomerId: actorType === 'CUSTOMER' ? actorId : undefined,
        tenantBookingWindow: this.tenantBookingWindow(),
      })
      .catch(mapBookingError);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(RequestBookingSchema)) body: RequestBookingDto,
  ): Promise<RequestBookingUseCaseResult> {
    const { tenantId, correlationId, settings } = this.ctx;
    return this.requestBooking
      .execute({
        ...body,
        tenantId,
        correlationId,
        countryCode: settings.localization.countryCode,
        timezone: settings.businessHours.timezone,
        tenantBookingWindow: this.tenantBookingWindow(),
      })
      .catch(mapBookingError);
  }

  @Post('authenticated')
  @HttpCode(HttpStatus.CREATED)
  createAuthenticated(
    @Body(new ZodValidationPipe(RequestAuthenticatedBookingSchema))
    body: RequestAuthenticatedBookingDto,
  ): Promise<RequestAuthenticatedBookingUseCaseResult> {
    const { tenantId, correlationId, actorId: customerId, settings } = this.ctx;
    return this.requestAuthenticatedBooking
      .execute({
        ...body,
        tenantId,
        correlationId,
        customerId: customerId!,
        countryCode: settings.localization.countryCode,
        timezone: settings.businessHours.timezone,
        tenantBookingWindow: this.tenantBookingWindow(),
      })
      .catch(mapBookingError);
  }

  // UC-108 — the acting staff id is the request context's, never the body's.
  @Post('staff')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(StaffOrManagerRoleGuard)
  createByStaff(
    @Body(new ZodValidationPipe(CreateBookingByStaffSchema)) body: CreateBookingByStaffDto,
  ): Promise<CreateBookingByStaffUseCaseResult> {
    const { tenantId, correlationId, actorId: staffId, settings } = this.ctx;
    return this.createBookingByStaff
      .execute({
        ...body,
        tenantId,
        correlationId,
        staffId: staffId!,
        countryCode: settings.localization.countryCode,
        timezone: settings.businessHours.timezone,
        tenantBookingWindow: this.tenantBookingWindow(),
      })
      .catch(mapBookingError);
  }

  private tenantBookingWindow(): TenantBookingWindow {
    const { booking } = this.ctx.settings;
    return {
      minBookingAdvanceHours: booking.minBookingAdvanceHours,
      maxBookingAdvanceDays: booking.maxBookingAdvanceDays,
    };
  }
}
