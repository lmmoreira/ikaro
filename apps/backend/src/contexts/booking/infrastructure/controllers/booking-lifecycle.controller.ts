import { Body, Controller, HttpCode, HttpStatus, Param, Patch, UseGuards } from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  ApproveBookingDto,
  ApproveBookingSchema,
} from '../../application/dtos/approve-booking.dto';
import { RejectBookingDto, RejectBookingSchema } from '../../application/dtos/reject-booking.dto';
import {
  ApproveBookingUseCase,
  ApproveBookingUseCaseResult,
} from '../../application/use-cases/approve-booking.use-case';
import {
  RejectBookingUseCase,
  RejectBookingUseCaseResult,
} from '../../application/use-cases/reject-booking.use-case';
import {
  RequestMoreInfoUseCase,
  RequestMoreInfoUseCaseResult,
} from '../../application/use-cases/request-more-info.use-case';
import {
  RequestMoreInfoBodySchema,
  RequestMoreInfoDto,
} from '../../application/dtos/request-more-info.dto';
import {
  SubmitBookingInfoBodySchema,
  SubmitBookingInfoDto,
} from '../../application/dtos/submit-booking-info.dto';
import {
  SubmitBookingInfoUseCase,
  SubmitBookingInfoUseCaseResult,
} from '../../application/use-cases/submit-booking-info.use-case';
import {
  SubmitGuestBookingInfoBodySchema,
  SubmitGuestBookingInfoDto,
} from '../../application/dtos/submit-guest-booking-info.dto';
import {
  SubmitGuestBookingInfoUseCase,
  SubmitGuestBookingInfoUseCaseResult,
} from '../../application/use-cases/submit-guest-booking-info.use-case';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { mapBookingError } from '../http/booking-error.mapper';

// TD37-S05: split from booking.controller.ts (read + creation) — same 'bookings' route prefix —
// to satisfy docs/CODE_STANDARDS.md's file-length limit. Approve/reject/info-exchange endpoints
// live here; cancel/reschedule/complete moved to booking-completion.controller.ts (still too many
// combined for one file under the limit).
@Controller('bookings')
export class BookingLifecycleController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly approveBooking: ApproveBookingUseCase,
    private readonly rejectBooking: RejectBookingUseCase,
    private readonly requestMoreInfo: RequestMoreInfoUseCase,
    private readonly submitBookingInfo: SubmitBookingInfoUseCase,
    private readonly submitGuestBookingInfo: SubmitGuestBookingInfoUseCase,
  ) {}

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  approve(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApproveBookingSchema)) body: ApproveBookingDto,
  ): Promise<ApproveBookingUseCaseResult> {
    const { tenantId, actorId: staffId, correlationId, settings } = this.ctx;
    return this.approveBooking
      .execute({
        bookingId: id,
        ...(body.scheduledAt ? { scheduledAt: body.scheduledAt } : {}),
        tenantId,
        staffId: staffId!,
        correlationId,
        timezone: settings.businessHours.timezone,
      })
      .catch(mapBookingError);
  }

  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RejectBookingSchema)) body: RejectBookingDto,
  ): Promise<RejectBookingUseCaseResult> {
    const { tenantId, actorId: staffId, correlationId } = this.ctx;
    return this.rejectBooking
      .execute({ bookingId: id, reason: body.reason, tenantId, staffId: staffId!, correlationId })
      .catch(mapBookingError);
  }

  @Patch(':id/request-info')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  requestInfo(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RequestMoreInfoBodySchema.omit({ bookingId: true })))
    body: Omit<RequestMoreInfoDto, 'bookingId'>,
  ): Promise<RequestMoreInfoUseCaseResult> {
    const { tenantId, actorId: staffId, correlationId } = this.ctx;
    return this.requestMoreInfo
      .execute({ bookingId: id, message: body.message, tenantId, staffId: staffId!, correlationId })
      .catch(mapBookingError);
  }

  @Patch(':id/submit-info')
  @HttpCode(HttpStatus.OK)
  submitInfo(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SubmitBookingInfoBodySchema.omit({ bookingId: true })))
    body: Omit<SubmitBookingInfoDto, 'bookingId'>,
  ): Promise<SubmitBookingInfoUseCaseResult> {
    const { tenantId, actorId: customerId, correlationId } = this.ctx;
    return this.submitBookingInfo
      .execute({
        bookingId: id,
        response: body.response,
        photoUrls: body.photoUrls,
        tenantId,
        customerId: customerId!,
        correlationId,
      })
      .catch(mapBookingError);
  }

  @Patch(':id/submit-info/guest')
  @HttpCode(HttpStatus.OK)
  submitInfoGuest(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SubmitGuestBookingInfoBodySchema.omit({ bookingId: true })))
    body: Omit<SubmitGuestBookingInfoDto, 'bookingId'>,
  ): Promise<SubmitGuestBookingInfoUseCaseResult> {
    const { tenantId, correlationId } = this.ctx;
    return this.submitGuestBookingInfo
      .execute({
        bookingId: id,
        contactEmail: body.contactEmail,
        response: body.response,
        photoUrls: body.photoUrls,
        tenantId,
        correlationId,
      })
      .catch(mapBookingError);
  }
}
