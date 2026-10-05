import {
  AvailabilityAlertCancelledEventBuilder,
  AvailabilityAlertCreatedEventBuilder,
  AvailabilityAlertExpiredEventBuilder,
  AvailabilityAlertUpdatedEventBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { LogAvailabilityAlertEventUseCase } from '../../application/use-cases/log-availability-alert-event.use-case';
import { AvailabilityAlertEventsHandler } from './availability-alert-events.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CORRELATION_ID = 'corr-events-handler-test';

describe('AvailabilityAlertEventsHandler', () => {
  let handler: AvailabilityAlertEventsHandler;
  let useCase: jest.Mocked<Pick<LogAvailabilityAlertEventUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue(undefined) };
    eventBus = new InMemoryEventBus();
    handler = new AvailabilityAlertEventsHandler(
      useCase as unknown as LogAvailabilityAlertEventUseCase,
      eventBus,
    );
  });

  it('subscribes to all 4 event types with the audit-log consumer name on init', () => {
    const spy = jest.spyOn(eventBus, 'subscribe');

    handler.onModuleInit();

    for (const eventName of [
      'AvailabilityAlertCreated',
      'AvailabilityAlertUpdated',
      'AvailabilityAlertCancelled',
      'AvailabilityAlertExpired',
    ]) {
      expect(spy).toHaveBeenCalledWith(
        eventName,
        expect.any(Function),
        LogAvailabilityAlertEventUseCase.CONSUMER_NAME,
      );
    }
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('calls the log use case exactly once with the correct DTO for AvailabilityAlertCreated', async () => {
    const event = new AvailabilityAlertCreatedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({
      eventId: event.eventId,
      eventName: 'AvailabilityAlertCreated',
      tenantId: TENANT_ID,
      alertId: event.data.alertId,
      correlationId: CORRELATION_ID,
    });
  });

  it.each([
    ['AvailabilityAlertUpdated', () => new AvailabilityAlertUpdatedEventBuilder().build()],
    ['AvailabilityAlertCancelled', () => new AvailabilityAlertCancelledEventBuilder().build()],
    ['AvailabilityAlertExpired', () => new AvailabilityAlertExpiredEventBuilder().build()],
  ])('handles %s', async (eventName, build) => {
    await handler.handle(build());

    expect(useCase.execute).toHaveBeenCalledWith(expect.objectContaining({ eventName }));
  });

  it('rethrows when the use case fails', async () => {
    const error = new Error('boom');
    useCase.execute.mockRejectedValueOnce(error);

    await expect(
      handler.handle(new AvailabilityAlertCreatedEventBuilder().build()),
    ).rejects.toThrow(error);
  });
});
