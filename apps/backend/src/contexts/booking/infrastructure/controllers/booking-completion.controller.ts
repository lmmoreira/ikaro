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
  RescheduleBookingDto,
  RescheduleBookingSchema,
} from '../../application/dtos/reschedule-booking.dto';
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

// TD37-S05: split from booking-lifecycle.controller.ts — same 'bookings' route prefix — to
// satisfy docs/CODE_STANDARDS.md's file-length limit. Cancel/reschedule/complete endpoints live
// here.
@Controller('bookings')
export class BookingCompletionController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly cancelBookingAsCustomer: CancelBookingAsCustomerUseCase,
    private readonly cancelBookingAsAdmin: CancelBookingAsAdminUseCase,
    private readonly rescheduleBooking: RescheduleBookingUseCase,
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

  @Patch(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  reschedule(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RescheduleBookingSchema)) body: RescheduleBookingDto,
  ): Promise<RescheduleBookingUseCaseResult> {
    const { tenantId, actorId: staffId, correlationId, settings } = this.ctx;
    return this.rescheduleBooking
      .execute({
        bookingId: id,
        scheduledAt: body.scheduledAt,
        adminNotes: body.adminNotes,
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
