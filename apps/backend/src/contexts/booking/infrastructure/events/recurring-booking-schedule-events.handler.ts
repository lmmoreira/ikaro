import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { RecurringBookingScheduleCreated } from '../../domain/events/recurring-booking-schedule-created.event';
import { RecurringBookingScheduleApprovalRequested } from '../../domain/events/recurring-booking-schedule-approval-requested.event';
import { RecurringBookingScheduleEnded } from '../../domain/events/recurring-booking-schedule-ended.event';
import { LogRecurringBookingScheduleEventUseCase } from '../../application/use-cases/log-recurring-booking-schedule-event.use-case';

type AnyRecurringBookingScheduleEvent =
  | RecurringBookingScheduleCreated
  | RecurringBookingScheduleApprovalRequested
  | RecurringBookingScheduleEnded;

// One handler covering all 3 M23-S04 event types — each is a thin audit-log-only consumer for now
// (docs/ANTI_PATTERNS.md § A domain event is drained), sharing the same use case since none of
// them has a real business consumer yet.
@Injectable()
export class RecurringBookingScheduleEventsHandler implements OnModuleInit {
  private readonly logger = new AppLogger(RecurringBookingScheduleEventsHandler.name);

  constructor(
    private readonly logUseCase: LogRecurringBookingScheduleEventUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<RecurringBookingScheduleCreated>(
      RecurringBookingScheduleCreated.name,
      (event) => this.handle(event),
      LogRecurringBookingScheduleEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe<RecurringBookingScheduleApprovalRequested>(
      RecurringBookingScheduleApprovalRequested.name,
      (event) => this.handle(event),
      LogRecurringBookingScheduleEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe<RecurringBookingScheduleEnded>(
      RecurringBookingScheduleEnded.name,
      (event) => this.handle(event),
      LogRecurringBookingScheduleEventUseCase.CONSUMER_NAME,
    );
  }

  async handle(event: AnyRecurringBookingScheduleEvent): Promise<void> {
    try {
      await this.logUseCase.execute({
        eventId: event.eventId,
        eventName: event.eventName,
        tenantId: event.tenantId,
        recurringScheduleId: event.data.recurringScheduleId,
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        'RecurringBookingScheduleEventsHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
