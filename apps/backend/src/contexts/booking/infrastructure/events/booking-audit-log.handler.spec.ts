import { LogDomainEventUseCase } from '../../../../shared/application/use-cases/log-domain-event.use-case';
import { Envelope } from '../../../../shared/domain/envelope';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { AvailabilityAlertCancelledEventBuilder } from '../../../../test/builders/booking/availability-alert-cancelled-event.builder';
import { AvailabilityAlertCreatedEventBuilder } from '../../../../test/builders/booking/availability-alert-created-event.builder';
import { AvailabilityAlertExpiredEventBuilder } from '../../../../test/builders/booking/availability-alert-expired-event.builder';
import { AvailabilityAlertMatchedEventBuilder } from '../../../../test/builders/booking/availability-alert-matched-event.builder';
import { AvailabilityAlertUpdatedEventBuilder } from '../../../../test/builders/booking/availability-alert-updated-event.builder';
import { BookingApprovedEventBuilder } from '../../../../test/builders/booking/booking-approved-event.builder';
import { BookingCancelledEventBuilder } from '../../../../test/builders/booking/booking-cancelled-event.builder';
import { BookingCompletedEventBuilder } from '../../../../test/builders/booking/booking-completed-event.builder';
import { BookingInfoRequestedEventBuilder } from '../../../../test/builders/booking/booking-info-requested-event.builder';
import { BookingInfoSubmittedEventBuilder } from '../../../../test/builders/booking/booking-info-submitted-event.builder';
import { BookingNoShowEventBuilder } from '../../../../test/builders/booking/booking-no-show-event.builder';
import { BookingRejectedEventBuilder } from '../../../../test/builders/booking/booking-rejected-event.builder';
import { BookingRequestedEventBuilder } from '../../../../test/builders/booking/booking-requested-event.builder';
import { BookingRescheduledEventBuilder } from '../../../../test/builders/booking/booking-rescheduled-event.builder';
import { FutureCommitmentExceptionDismissedEventBuilder } from '../../../../test/builders/booking/future-commitment-exception-dismissed-event.builder';
import { FutureCommitmentExceptionRaisedEventBuilder } from '../../../../test/builders/booking/future-commitment-exception-raised-event.builder';
import { FutureCommitmentExceptionResolvedEventBuilder } from '../../../../test/builders/booking/future-commitment-exception-resolved-event.builder';
import { RecurringBookingScheduleApprovalRequestedEventBuilder } from '../../../../test/builders/booking/recurring-booking-schedule-approval-requested-event.builder';
import { RecurringBookingScheduleCreatedEventBuilder } from '../../../../test/builders/booking/recurring-booking-schedule-created-event.builder';
import { RecurringBookingScheduleEndedEventBuilder } from '../../../../test/builders/booking/recurring-booking-schedule-ended-event.builder';
import { RecurringBookingScheduleRejectedEventBuilder } from '../../../../test/builders/booking/recurring-booking-schedule-rejected-event.builder';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { BookingAuditLogHandler } from './booking-audit-log.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000036';

// Every domain event the booking context owns, each built by its real builder. The set is pinned
// here and kept in step with the handler by architecture-check's domain-event-audit-coverage
// detector.
const EVENT_BUILDERS: Record<string, () => Envelope> = {
  AvailabilityAlertCancelled: () =>
    new AvailabilityAlertCancelledEventBuilder().withTenantId(TENANT_ID).build(),
  AvailabilityAlertCreated: () =>
    new AvailabilityAlertCreatedEventBuilder().withTenantId(TENANT_ID).build(),
  AvailabilityAlertExpired: () =>
    new AvailabilityAlertExpiredEventBuilder().withTenantId(TENANT_ID).build(),
  AvailabilityAlertMatched: () =>
    new AvailabilityAlertMatchedEventBuilder().withTenantId(TENANT_ID).build(),
  AvailabilityAlertUpdated: () =>
    new AvailabilityAlertUpdatedEventBuilder().withTenantId(TENANT_ID).build(),
  BookingApproved: () => new BookingApprovedEventBuilder().withTenantId(TENANT_ID).build(),
  BookingCancelled: () => new BookingCancelledEventBuilder().withTenantId(TENANT_ID).build(),
  BookingCompleted: () => new BookingCompletedEventBuilder().withTenantId(TENANT_ID).build(),
  BookingInfoRequested: () =>
    new BookingInfoRequestedEventBuilder().withTenantId(TENANT_ID).build(),
  BookingInfoSubmitted: () =>
    new BookingInfoSubmittedEventBuilder().withTenantId(TENANT_ID).build(),
  BookingNoShow: () => new BookingNoShowEventBuilder().withTenantId(TENANT_ID).build(),
  BookingRejected: () => new BookingRejectedEventBuilder().withTenantId(TENANT_ID).build(),
  BookingRequested: () => new BookingRequestedEventBuilder().withTenantId(TENANT_ID).build(),
  BookingRescheduled: () => new BookingRescheduledEventBuilder().withTenantId(TENANT_ID).build(),
  FutureCommitmentExceptionDismissed: () =>
    new FutureCommitmentExceptionDismissedEventBuilder().withTenantId(TENANT_ID).build(),
  FutureCommitmentExceptionRaised: () =>
    new FutureCommitmentExceptionRaisedEventBuilder().withTenantId(TENANT_ID).build(),
  FutureCommitmentExceptionResolved: () =>
    new FutureCommitmentExceptionResolvedEventBuilder().withTenantId(TENANT_ID).build(),
  RecurringBookingScheduleApprovalRequested: () =>
    new RecurringBookingScheduleApprovalRequestedEventBuilder().withTenantId(TENANT_ID).build(),
  RecurringBookingScheduleCreated: () =>
    new RecurringBookingScheduleCreatedEventBuilder().withTenantId(TENANT_ID).build(),
  RecurringBookingScheduleEnded: () =>
    new RecurringBookingScheduleEndedEventBuilder().withTenantId(TENANT_ID).build(),
  RecurringBookingScheduleRejected: () =>
    new RecurringBookingScheduleRejectedEventBuilder().withTenantId(TENANT_ID).build(),
};
const EVENT_NAMES = Object.keys(EVENT_BUILDERS);

describe('BookingAuditLogHandler', () => {
  let handler: BookingAuditLogHandler;
  let useCase: jest.Mocked<Pick<LogDomainEventUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;

  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue(undefined) };
    eventBus = new InMemoryEventBus();
    handler = new BookingAuditLogHandler(useCase as unknown as LogDomainEventUseCase, eventBus);
  });

  it('subscribes to exactly the 21 booking domain event(s), all with the audit-log consumer name', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions.map((s) => s.eventName).sort()).toEqual([...EVENT_NAMES].sort());
    expect(new Set(eventBus.subscriptions.map((s) => s.consumerName))).toEqual(
      new Set([LogDomainEventUseCase.CONSUMER_NAME]),
    );
    expect(LogDomainEventUseCase.CONSUMER_NAME).toBe('audit-log');
  });

  it.each(EVENT_NAMES)(
    'routes %s to the log use case with its envelope fields and its own correlationId',
    async (eventName) => {
      handler.onModuleInit();
      const event = EVENT_BUILDERS[eventName]();
      const subscription = eventBus.subscriptions.find((s) => s.eventName === eventName);

      await subscription?.handler(event);

      expect(subscription).toBeDefined();
      expect(useCase.execute).toHaveBeenCalledTimes(1);
      expect(useCase.execute).toHaveBeenCalledWith({
        eventId: event.eventId,
        eventName,
        tenantId: TENANT_ID,
        occurredAt: event.occurredAt,
        correlationId: event.correlationId,
      });
    },
  );

  it('rethrows when the use case fails, so Pub/Sub nacks and retries', async () => {
    jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
    const event = EVENT_BUILDERS[EVENT_NAMES[0]]();
    const error = new Error('boom');
    useCase.execute.mockRejectedValueOnce(error);

    await expect(handler.handle(event)).rejects.toThrow(error);
  });
});
