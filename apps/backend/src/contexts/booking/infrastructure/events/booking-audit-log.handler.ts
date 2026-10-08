import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { LogDomainEventUseCase } from '../../../../shared/application/use-cases/log-domain-event.use-case';
import { Envelope } from '../../../../shared/domain/envelope';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { AvailabilityAlertCancelled } from '../../domain/events/availability-alert-cancelled.event';
import { AvailabilityAlertCreated } from '../../domain/events/availability-alert-created.event';
import { AvailabilityAlertExpired } from '../../domain/events/availability-alert-expired.event';
import { AvailabilityAlertMatched } from '../../domain/events/availability-alert-matched.event';
import { AvailabilityAlertUpdated } from '../../domain/events/availability-alert-updated.event';
import { BookingApproved } from '../../domain/events/booking-approved.event';
import { BookingCancelled } from '../../domain/events/booking-cancelled.event';
import { BookingCompleted } from '../../domain/events/booking-completed.event';
import { BookingInfoRequested } from '../../domain/events/booking-info-requested.event';
import { BookingInfoSubmitted } from '../../domain/events/booking-info-submitted.event';
import { BookingNoShow } from '../../domain/events/booking-no-show.event';
import { BookingRejected } from '../../domain/events/booking-rejected.event';
import { BookingRequested } from '../../domain/events/booking-requested.event';
import { BookingRescheduled } from '../../domain/events/booking-rescheduled.event';
import { FutureCommitmentExceptionDismissed } from '../../domain/events/future-commitment-exception-dismissed.event';
import { FutureCommitmentExceptionRaised } from '../../domain/events/future-commitment-exception-raised.event';
import { FutureCommitmentExceptionResolved } from '../../domain/events/future-commitment-exception-resolved.event';
import { RecurringBookingScheduleApprovalRequested } from '../../domain/events/recurring-booking-schedule-approval-requested.event';
import { RecurringBookingScheduleCreated } from '../../domain/events/recurring-booking-schedule-created.event';
import { RecurringBookingScheduleEnded } from '../../domain/events/recurring-booking-schedule-ended.event';
import { RecurringBookingScheduleRejected } from '../../domain/events/recurring-booking-schedule-rejected.event';

// The booking context's `audit-log` consumer (M23-S36): subscribes to every domain event this
// context owns and hands each one to the shared LogDomainEventUseCase. A new booking event must be
// added here — `architecture-check`'s domain-event-audit-coverage detector fails CI otherwise.
//
// The subscriptions are spelled out one `subscribe(<Event>.name, …)` call each, grouped by
// aggregate only to stay under the max-lines-per-function limit: the Pub/Sub catalog generator
// (packages/infra-scripts/src/pubsub-catalog.ts) and the detector both read the literal call-site
// shape, so a loop over an array would hide the events from both.
@Injectable()
export class BookingAuditLogHandler implements OnModuleInit {
  private readonly logger = new AppLogger(BookingAuditLogHandler.name);

  constructor(
    private readonly logUseCase: LogDomainEventUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.subscribeBookingRequestEvents();
    this.subscribeBookingOutcomeEvents();
    this.subscribeAvailabilityAlertEvents();
    this.subscribeFutureCommitmentExceptionEvents();
    this.subscribeRecurringScheduleEvents();
  }

  private subscribeBookingRequestEvents(): void {
    this.eventBus.subscribe(
      BookingRequested.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      BookingInfoRequested.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      BookingInfoSubmitted.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      BookingApproved.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      BookingRejected.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
  }

  private subscribeBookingOutcomeEvents(): void {
    this.eventBus.subscribe(
      BookingCancelled.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      BookingRescheduled.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      BookingCompleted.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      BookingNoShow.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
  }

  private subscribeAvailabilityAlertEvents(): void {
    this.eventBus.subscribe(
      AvailabilityAlertCreated.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      AvailabilityAlertUpdated.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      AvailabilityAlertCancelled.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      AvailabilityAlertExpired.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      AvailabilityAlertMatched.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
  }

  private subscribeFutureCommitmentExceptionEvents(): void {
    this.eventBus.subscribe(
      FutureCommitmentExceptionRaised.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      FutureCommitmentExceptionResolved.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      FutureCommitmentExceptionDismissed.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
  }

  private subscribeRecurringScheduleEvents(): void {
    this.eventBus.subscribe(
      RecurringBookingScheduleCreated.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      RecurringBookingScheduleApprovalRequested.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      RecurringBookingScheduleRejected.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      RecurringBookingScheduleEnded.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
  }

  async handle(event: Envelope): Promise<void> {
    try {
      await this.logUseCase.execute({
        eventId: event.eventId,
        eventName: event.eventName,
        tenantId: event.tenantId,
        occurredAt: event.occurredAt,
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        'BookingAuditLogHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
