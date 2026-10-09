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
import { RequestContext } from '../../../../shared/request/request-context';
import { AnyAuthenticatedRoleGuard } from '../../../../shared/guards/any-authenticated-role.guard';
import {
  ListRecurringBookingSchedulesDto,
  ListRecurringBookingSchedulesSchema,
} from '../../application/dtos/list-recurring-booking-schedules.dto';
import {
  RequestRecurringBookingScheduleDto,
  RequestRecurringBookingScheduleSchema,
} from '../../application/dtos/request-recurring-booking-schedule.dto';
import {
  RequestRecurringBookingScheduleUseCase,
  RequestRecurringBookingScheduleUseCaseResult,
} from '../../application/use-cases/request-recurring-booking-schedule.use-case';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import {
  ApproveRecurringBookingScheduleUseCase,
  ApproveRecurringBookingScheduleUseCaseResult,
} from '../../application/use-cases/approve-recurring-booking-schedule.use-case';
import {
  RejectRecurringBookingScheduleUseCase,
  RejectRecurringBookingScheduleUseCaseResult,
} from '../../application/use-cases/reject-recurring-booking-schedule.use-case';
import {
  EndRecurringBookingScheduleUseCase,
  EndRecurringBookingScheduleUseCaseResult,
} from '../../application/use-cases/end-recurring-booking-schedule.use-case';
import {
  ListRecurringBookingSchedulesUseCase,
  ListRecurringBookingSchedulesUseCaseResult,
} from '../../application/use-cases/list-recurring-booking-schedules.use-case';
import { mapBookingError } from '../http/booking-error.mapper';

@Controller('recurring-booking-schedules')
@UseGuards(AnyAuthenticatedRoleGuard)
export class RecurringBookingScheduleController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly requestSchedule: RequestRecurringBookingScheduleUseCase,
    private readonly listSchedules: ListRecurringBookingSchedulesUseCase,
    private readonly endSchedule: EndRecurringBookingScheduleUseCase,
    private readonly approveSchedule: ApproveRecurringBookingScheduleUseCase,
    private readonly rejectSchedule: RejectRecurringBookingScheduleUseCase,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListRecurringBookingSchedulesSchema))
    query: ListRecurringBookingSchedulesDto,
  ): Promise<ListRecurringBookingSchedulesUseCaseResult> {
    const { tenantId, actorId, actorRole } = this.ctx;
    const isStaffOrManager = actorRole === 'STAFF' || actorRole === 'MANAGER';
    return this.listSchedules
      .execute({
        ...query,
        tenantId,
        customerId: isStaffOrManager ? undefined : actorId,
      })
      .catch(mapBookingError);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  request(
    @Body(new ZodValidationPipe(RequestRecurringBookingScheduleSchema))
    body: RequestRecurringBookingScheduleDto,
  ): Promise<RequestRecurringBookingScheduleUseCaseResult> {
    const { tenantId, correlationId, actorType, actorId, settings } = this.ctx;
    return this.requestSchedule
      .execute({
        tenantId,
        correlationId,
        timezone: settings.businessHours.timezone,
        serviceId: body.serviceId,
        recurrence: body.recurrence,
        startsOn: body.startsOn,
        endsOn: body.endsOn,
        assignmentPolicy: body.assignmentPolicy,
        resourceIds: body.resourceIds ?? [],
        actorType: actorType!,
        actorId: actorId!,
        bodyCustomerId: body.customerId,
        tenantBookingWindow: {
          minBookingAdvanceHours: settings.booking.minBookingAdvanceHours,
          maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
        },
        renewsScheduleId: body.renewsScheduleId,
      })
      .catch(mapBookingError);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  end(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<EndRecurringBookingScheduleUseCaseResult> {
    const { tenantId, correlationId, actorId, actorRole } = this.ctx;
    return this.endSchedule
      .execute({
        scheduleId: id,
        tenantId,
        correlationId,
        actorId: actorId!,
        actorRole: actorRole!,
      })
      .catch(mapBookingError);
  }

  @Post(':id/approve')
  @UseGuards(StaffOrManagerRoleGuard)
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<ApproveRecurringBookingScheduleUseCaseResult> {
    const { tenantId, correlationId, actorId, settings } = this.ctx;
    return this.approveSchedule
      .execute({
        scheduleId: id,
        tenantId,
        correlationId,
        timezone: settings.businessHours.timezone,
        actorId: actorId!,
      })
      .catch(mapBookingError);
  }

  @Post(':id/reject')
  @UseGuards(StaffOrManagerRoleGuard)
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<RejectRecurringBookingScheduleUseCaseResult> {
    const { tenantId, correlationId } = this.ctx;
    return this.rejectSchedule
      .execute({ scheduleId: id, tenantId, correlationId })
      .catch(mapBookingError);
  }
}
