import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
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
import { ListBookingsDto, ListBookingsSchema } from '../../application/dtos/list-bookings.dto';
import {
  ListBookingsUseCase,
  ListBookingsUseCaseResult,
} from '../../application/use-cases/list-bookings.use-case';
import {
  GetBookingByIdUseCase,
  GetBookingByIdUseCaseResult,
} from '../../application/use-cases/get-booking-by-id.use-case';
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
      })
      .catch(mapBookingError);
  }
}
