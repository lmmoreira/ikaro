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
import {
  RequestBookingDto,
  RequestBookingSchema,
} from '../../application/dtos/request-booking.dto';
import {
  RequestAuthenticatedBookingDto,
  RequestAuthenticatedBookingSchema,
} from '../../application/dtos/request-authenticated-booking.dto';
import {
  RejectBookingBody,
  RejectBookingBodySchema,
} from '../../application/dtos/reject-booking.dto';
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
  GetBookingUseCase,
  GetBookingUseCaseResult,
} from '../../application/use-cases/get-booking.use-case';
import {
  CancelBookingAsCustomerUseCase,
  CancelBookingAsCustomerUseCaseResult,
} from '../../application/use-cases/cancel-booking-as-customer.use-case';
import {
  CancelBookingAsAdminUseCase,
  CancelBookingAsAdminUseCaseResult,
} from '../../application/use-cases/cancel-booking-as-admin.use-case';
import {
  CancelBookingAsAdminBody,
  CancelBookingAsAdminBodySchema,
} from '../../application/dtos/cancel-booking-as-admin.dto';
import {
  RescheduleBookingUseCase,
  RescheduleBookingUseCaseResult,
} from '../../application/use-cases/reschedule-booking.use-case';
import {
  RescheduleBookingBody,
  RescheduleBookingBodySchema,
} from '../../application/dtos/reschedule-booking.dto';
import {
  CompleteBookingBody,
  CompleteBookingBodySchema,
} from '../../application/dtos/complete-booking.dto';
import {
  CompleteBookingUseCase,
  CompleteBookingUseCaseResult,
} from '../../application/use-cases/complete-booking.use-case';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { mapBookingError } from '../http/booking-error.mapper';

@Controller('bookings')
export class BookingController {
  constructor(
    private readonly requestBooking: RequestBookingUseCase,
    private readonly requestAuthenticatedBooking: RequestAuthenticatedBookingUseCase,
    private readonly approveBooking: ApproveBookingUseCase,
    private readonly rejectBooking: RejectBookingUseCase,
    private readonly requestMoreInfo: RequestMoreInfoUseCase,
    private readonly submitBookingInfo: SubmitBookingInfoUseCase,
    private readonly submitGuestBookingInfo: SubmitGuestBookingInfoUseCase,
    private readonly listBookings: ListBookingsUseCase,
    private readonly getBooking: GetBookingUseCase,
    private readonly cancelBookingAsCustomer: CancelBookingAsCustomerUseCase,
    private readonly cancelBookingAsAdmin: CancelBookingAsAdminUseCase,
    private readonly rescheduleBooking: RescheduleBookingUseCase,
    private readonly completeBooking: CompleteBookingUseCase,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListBookingsSchema)) query: ListBookingsDto,
  ): Promise<ListBookingsUseCaseResult> {
    return this.listBookings.execute(query).catch(mapBookingError);
  }

  @Get(':id')
  getOne(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
  ): Promise<GetBookingUseCaseResult> {
    return this.getBooking.execute({ bookingId: id }).catch(mapBookingError);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(RequestBookingSchema)) body: RequestBookingDto,
  ): Promise<RequestBookingUseCaseResult> {
    return this.requestBooking.execute(body).catch(mapBookingError);
  }

  @Post('authenticated')
  @HttpCode(HttpStatus.CREATED)
  createAuthenticated(
    @Body(new ZodValidationPipe(RequestAuthenticatedBookingSchema))
    body: RequestAuthenticatedBookingDto,
  ): Promise<RequestAuthenticatedBookingUseCaseResult> {
    return this.requestAuthenticatedBooking.execute(body).catch(mapBookingError);
  }

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  approve(@Param('id') id: string): Promise<ApproveBookingUseCaseResult> {
    return this.approveBooking.execute({ bookingId: id }).catch(mapBookingError);
  }

  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RejectBookingBodySchema)) body: RejectBookingBody,
  ): Promise<RejectBookingUseCaseResult> {
    return this.rejectBooking
      .execute({ bookingId: id, reason: body.reason })
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
    return this.requestMoreInfo
      .execute({ bookingId: id, message: body.message })
      .catch(mapBookingError);
  }

  @Patch(':id/submit-info')
  @HttpCode(HttpStatus.OK)
  submitInfo(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SubmitBookingInfoBodySchema.omit({ bookingId: true })))
    body: Omit<SubmitBookingInfoDto, 'bookingId'>,
  ): Promise<SubmitBookingInfoUseCaseResult> {
    return this.submitBookingInfo
      .execute({ bookingId: id, response: body.response, photoUrls: body.photoUrls })
      .catch(mapBookingError);
  }

  @Patch(':id/cancel-customer')
  @HttpCode(HttpStatus.OK)
  cancelAsCustomer(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
  ): Promise<CancelBookingAsCustomerUseCaseResult> {
    return this.cancelBookingAsCustomer.execute({ bookingId: id }).catch(mapBookingError);
  }

  @Patch(':id/cancel-admin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  cancelAsAdmin(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
    @Body(new ZodValidationPipe(CancelBookingAsAdminBodySchema)) body: CancelBookingAsAdminBody,
  ): Promise<CancelBookingAsAdminUseCaseResult> {
    return this.cancelBookingAsAdmin
      .execute({ bookingId: id, reason: body.reason })
      .catch(mapBookingError);
  }

  @Patch(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  reschedule(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
    @Body(new ZodValidationPipe(RescheduleBookingBodySchema)) body: RescheduleBookingBody,
  ): Promise<RescheduleBookingUseCaseResult> {
    return this.rescheduleBooking
      .execute({ bookingId: id, scheduledAt: body.scheduledAt, adminNotes: body.adminNotes })
      .catch(mapBookingError);
  }

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  complete(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
    @Body(new ZodValidationPipe(CompleteBookingBodySchema)) body: CompleteBookingBody,
  ): Promise<CompleteBookingUseCaseResult> {
    return this.completeBooking
      .execute({
        bookingId: id,
        lines: body.lines,
        afterServicePhotoUrls: body.afterServicePhotoUrls,
        adminNotes: body.adminNotes,
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
    return this.submitGuestBookingInfo
      .execute({
        bookingId: id,
        contactEmail: body.contactEmail,
        response: body.response,
        photoUrls: body.photoUrls,
      })
      .catch(mapBookingError);
  }
}
