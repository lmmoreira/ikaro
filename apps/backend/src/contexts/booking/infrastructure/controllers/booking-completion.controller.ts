import { Body, Controller, HttpCode, HttpStatus, Param, Patch, UseGuards } from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  CancelBookingAsCustomerUseCase,
  CancelBookingAsCustomerUseCaseResult,
} from '../../application/use-cases/cancel-booking-as-customer.use-case';
import {
  CancelBookingAsAdminUseCase,
  CancelBookingAsAdminUseCaseResult,
} from '../../application/use-cases/cancel-booking-as-admin.use-case';
import {
  CancelBookingAsAdminDto,
  CancelBookingAsAdminSchema,
} from '../../application/dtos/cancel-booking-as-admin.dto';
import {
  RescheduleBookingUseCase,
  RescheduleBookingUseCaseResult,
} from '../../application/use-cases/reschedule-booking.use-case';
import {
  RescheduleBookingAsCustomerUseCase,
  RescheduleBookingAsCustomerUseCaseResult,
} from '../../application/use-cases/reschedule-booking-as-customer.use-case';
import {
  RescheduleBookingDto,
  RescheduleBookingSchema,
} from '../../application/dtos/reschedule-booking.dto';
import {
  RescheduleBookingAsCustomerDto,
  RescheduleBookingAsCustomerSchema,
} from '../../application/dtos/reschedule-booking-as-customer.dto';
import {
  CompleteBookingDto,
  CompleteBookingSchema,
} from '../../application/dtos/complete-booking.dto';
import {
  CompleteBookingUseCase,
  CompleteBookingUseCaseResult,
} from '../../application/use-cases/complete-booking.use-case';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { mapBookingError } from '../http/booking-error.mapper';

// Split from booking-lifecycle.controller.ts — same 'bookings' route prefix — to satisfy
// docs/CODE_STANDARDS.md's file-length limit. Cancel/reschedule/complete endpoints live here.
@Controller('bookings')
export class BookingCompletionController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly cancelBookingAsCustomer: CancelBookingAsCustomerUseCase,
    private readonly cancelBookingAsAdmin: CancelBookingAsAdminUseCase,
    private readonly rescheduleBooking: RescheduleBookingUseCase,
    private readonly rescheduleBookingAsCustomer: RescheduleBookingAsCustomerUseCase,
    private readonly completeBooking: CompleteBookingUseCase,
  ) {}

  @Patch(':id/cancel-customer')
  @HttpCode(HttpStatus.OK)
  cancelAsCustomer(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<CancelBookingAsCustomerUseCaseResult> {
    const { tenantId, actorId: customerId, correlationId, settings } = this.ctx;
    return this.cancelBookingAsCustomer
      .execute({
        bookingId: id,
        tenantId,
        customerId: customerId!,
        correlationId,
        cancellationWindowHours: settings.booking.cancellationWindowHours,
      })
      .catch(mapBookingError);
  }

  @Patch(':id/cancel-admin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  cancelAsAdmin(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CancelBookingAsAdminSchema)) body: CancelBookingAsAdminDto,
  ): Promise<CancelBookingAsAdminUseCaseResult> {
    const { tenantId, actorId: staffId, correlationId } = this.ctx;
    return this.cancelBookingAsAdmin
      .execute({ bookingId: id, reason: body.reason, tenantId, staffId: staffId!, correlationId })
      .catch(mapBookingError);
  }

  @Patch(':id/reschedule-customer')
  @HttpCode(HttpStatus.OK)
  rescheduleAsCustomer(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RescheduleBookingAsCustomerSchema))
    body: RescheduleBookingAsCustomerDto,
  ): Promise<RescheduleBookingAsCustomerUseCaseResult> {
    const { tenantId, actorId: customerId, correlationId, settings } = this.ctx;
    return this.rescheduleBookingAsCustomer
      .execute({
        bookingId: id,
        scheduledAt: body.scheduledAt,
        resourceSelections: body.resourceSelections,
        durationMinutes: body.durationMinutes,
        tenantId,
        customerId: customerId!,
        correlationId,
        timezone: settings.businessHours.timezone,
        tenantDefaultRescheduleWindowHours: settings.booking.cancellationWindowHours,
      })
      .catch(mapBookingError);
  }

  @Patch(':id/reschedule-admin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  rescheduleAsAdmin(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RescheduleBookingSchema)) body: RescheduleBookingDto,
  ): Promise<RescheduleBookingUseCaseResult> {
    const { tenantId, actorId: staffId, correlationId, settings } = this.ctx;
    return this.rescheduleBooking
      .execute({
        bookingId: id,
        scheduledAt: body.scheduledAt,
        adminNotes: body.adminNotes,
        resourceSelections: body.resourceSelections,
        durationMinutes: body.durationMinutes,
        tenantId,
        staffId: staffId!,
        correlationId,
        timezone: settings.businessHours.timezone,
      })
      .catch(mapBookingError);
  }

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  complete(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CompleteBookingSchema)) body: CompleteBookingDto,
  ): Promise<CompleteBookingUseCaseResult> {
    const { tenantId, actorId: staffId, correlationId, settings } = this.ctx;
    return this.completeBooking
      .execute({
        bookingId: id,
        lines: body.lines,
        afterServicePhotoUrls: body.afterServicePhotoUrls,
        adminNotes: body.adminNotes,
        discountByPoints: body.discountByPoints,
        tenantId,
        staffId: staffId!,
        correlationId,
        currency: settings.localization.currency,
        pointsPerCurrencyUnit: settings.loyalty.pointsPerCurrencyUnit,
      })
      .catch(mapBookingError);
  }
}
