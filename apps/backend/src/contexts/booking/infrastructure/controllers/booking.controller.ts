import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
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
  ApproveBookingDto,
  ApproveBookingSchema,
} from '../../application/dtos/approve-booking.dto';
import { RejectBookingDto, RejectBookingSchema } from '../../application/dtos/reject-booking.dto';
import {
  RequestBookingUseCase,
  RequestBookingUseCaseResult,
} from '../../application/use-cases/request-booking.use-case';
import {
  RequestAuthenticatedBookingUseCase,
  RequestAuthenticatedBookingUseCaseResult,
} from '../../application/use-cases/request-authenticated-booking.use-case';
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
import { ListBookingsDto, ListBookingsSchema } from '../../application/dtos/list-bookings.dto';
import {
  ListBookingsUseCase,
  ListBookingsUseCaseResult,
} from '../../application/use-cases/list-bookings.use-case';
import {
  GetBookingByIdUseCase,
  GetBookingByIdUseCaseResult,
} from '../../application/use-cases/get-booking-by-id.use-case';
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
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { mapBookingError } from '../http/booking-error.mapper';

@Controller('bookings')
export class BookingController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly requestBooking: RequestBookingUseCase,
    private readonly requestAuthenticatedBooking: RequestAuthenticatedBookingUseCase,
    private readonly approveBooking: ApproveBookingUseCase,
    private readonly rejectBooking: RejectBookingUseCase,
    private readonly requestMoreInfo: RequestMoreInfoUseCase,
    private readonly submitBookingInfo: SubmitBookingInfoUseCase,
    private readonly submitGuestBookingInfo: SubmitGuestBookingInfoUseCase,
    private readonly listBookings: ListBookingsUseCase,
    private readonly getBooking: GetBookingByIdUseCase,
    private readonly cancelBookingAsCustomer: CancelBookingAsCustomerUseCase,
    private readonly cancelBookingAsAdmin: CancelBookingAsAdminUseCase,
    private readonly rescheduleBooking: RescheduleBookingUseCase,
    private readonly completeBooking: CompleteBookingUseCase,
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
  getOne(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
  ): Promise<GetBookingByIdUseCaseResult> {
    const { tenantId, actorType, actorId, settings } = this.ctx;
    return this.getBooking
      .execute({
        bookingId: id,
        tenantId,
        cancellationWindowHours: settings.booking.cancellationWindowHours,
      })
      .then((result) => {
        if (actorType === 'CUSTOMER' && result.customerId !== actorId) {
          throw new BookingNotFoundError(id);
        }
        return result;
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

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  approve(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
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

  @Patch(':id/cancel-customer')
  @HttpCode(HttpStatus.OK)
  cancelAsCustomer(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
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
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
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
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
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
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
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
