import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import { AnyAuthenticatedRoleGuard } from '../../../../shared/guards/any-authenticated-role.guard';
import {
  RequestRecurringBookingScheduleDto,
  RequestRecurringBookingScheduleSchema,
  SkipOrRescheduleOccurrenceDto,
  SkipOrRescheduleOccurrenceSchema,
} from '../../application/dtos/request-recurring-booking-schedule.dto';
import {
  RequestRecurringBookingScheduleUseCase,
  RequestRecurringBookingScheduleUseCaseResult,
} from '../../application/use-cases/request-recurring-booking-schedule.use-case';
import {
  SkipOrRescheduleOccurrenceUseCase,
  SkipOrRescheduleOccurrenceUseCaseResult,
} from '../../application/use-cases/skip-or-reschedule-occurrence.use-case';
import {
  PauseRecurringBookingScheduleUseCase,
  PauseRecurringBookingScheduleUseCaseResult,
} from '../../application/use-cases/pause-recurring-booking-schedule.use-case';
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
    private readonly skipOrRescheduleOccurrence: SkipOrRescheduleOccurrenceUseCase,
    private readonly pauseSchedule: PauseRecurringBookingScheduleUseCase,
    private readonly endSchedule: EndRecurringBookingScheduleUseCase,
  ) {}

  @Get()
  list(): Promise<ListRecurringBookingSchedulesUseCaseResult> {
    const { tenantId, actorId, actorRole } = this.ctx;
    const isStaffOrManager = actorRole === 'STAFF' || actorRole === 'MANAGER';
    return this.listSchedules
      .execute({
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
        endsOn: body.endsOn ?? null,
        assignmentPolicy: body.assignmentPolicy,
        resourceIds: body.resourceIds ?? [],
        actorType: actorType!,
        actorId: actorId!,
        bodyCustomerId: body.customerId,
      })
      .catch(mapBookingError);
  }

  @Patch(':id/occurrences/:occurrenceStart')
  @HttpCode(HttpStatus.OK)
  skipOrReschedule(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Param('occurrenceStart') occurrenceStart: string,
    @Body(new ZodValidationPipe(SkipOrRescheduleOccurrenceSchema))
    body: SkipOrRescheduleOccurrenceDto,
  ): Promise<SkipOrRescheduleOccurrenceUseCaseResult> {
    const { tenantId, correlationId, actorType, actorId } = this.ctx;
    return this.skipOrRescheduleOccurrence
      .execute({
        scheduleId: id,
        tenantId,
        correlationId,
        occurrenceStart: new Date(occurrenceStart),
        action: body.action,
        replacementBookingId: body.replacementBookingId,
        reason: body.reason,
        actorType: actorType!,
        actorId: actorId!,
      })
      .catch(mapBookingError);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  pause(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<PauseRecurringBookingScheduleUseCaseResult> {
    const { tenantId, correlationId } = this.ctx;
    return this.pauseSchedule
      .execute({ scheduleId: id, tenantId, correlationId })
      .catch(mapBookingError);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  end(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<EndRecurringBookingScheduleUseCaseResult> {
    const { tenantId, correlationId, actorType, actorId } = this.ctx;
    return this.endSchedule
      .execute({
        scheduleId: id,
        tenantId,
        correlationId,
        actorId: actorId!,
        isBusiness: actorType === 'STAFF',
      })
      .catch(mapBookingError);
  }
}
