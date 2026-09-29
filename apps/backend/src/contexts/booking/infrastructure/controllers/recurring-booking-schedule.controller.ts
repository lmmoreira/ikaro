import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  OccurrenceStartParamSchema,
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
    private readonly endSchedule: EndRecurringBookingScheduleUseCase,
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
      })
      .catch(mapBookingError);
  }

  @Patch(':id/occurrences/:occurrenceStart')
  @HttpCode(HttpStatus.OK)
  skipOrReschedule(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Param('occurrenceStart', new ZodValidationPipe(OccurrenceStartParamSchema))
    occurrenceStart: string,
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
        actorType: actorType!,
        actorId: actorId!,
        isBusiness: actorType === 'STAFF',
      })
      .catch(mapBookingError);
  }
}
