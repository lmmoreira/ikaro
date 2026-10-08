import { LogDomainEventUseCase } from '../../../../shared/application/use-cases/log-domain-event.use-case';
import { ServicePointsEarnedEventBuilder } from '../../../../test/builders/loyalty/service-points-earned-event.builder';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { LoyaltyAuditLogHandler } from './loyalty-audit-log.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000036';
const CORRELATION_ID = 'corr-loyalty-audit-log-handler-test';

// Every domain event the loyalty context owns — kept in step with the handler by the
// domain-event-audit-coverage detector; this list is the spec-side pin on the exact set.
const EXPECTED_EVENT_NAMES = ['ServicePointsEarned'];

describe('LoyaltyAuditLogHandler', () => {
  let handler: LoyaltyAuditLogHandler;
  let useCase: jest.Mocked<Pick<LogDomainEventUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;

  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue(undefined) };
    eventBus = new InMemoryEventBus();
    handler = new LoyaltyAuditLogHandler(useCase as unknown as LogDomainEventUseCase, eventBus);
  });

  it('subscribes to exactly the 1 loyalty domain event(s), all with the audit-log consumer name', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions.map((s) => s.eventName).sort()).toEqual(
      [...EXPECTED_EVENT_NAMES].sort(),
    );
    expect(new Set(eventBus.subscriptions.map((s) => s.consumerName))).toEqual(
      new Set([LogDomainEventUseCase.CONSUMER_NAME]),
    );
    expect(LogDomainEventUseCase.CONSUMER_NAME).toBe('audit-log');
  });

  it('routes a subscribed event to the log use case with the envelope fields and event.correlationId', async () => {
    handler.onModuleInit();
    const event = new ServicePointsEarnedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .build();
    const subscription = eventBus.subscriptions.find((s) => s.eventName === 'ServicePointsEarned');

    await subscription?.handler(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({
      eventId: event.eventId,
      eventName: 'ServicePointsEarned',
      tenantId: TENANT_ID,
      occurredAt: event.occurredAt,
      correlationId: CORRELATION_ID,
    });
  });

  it('rethrows when the use case fails, so Pub/Sub nacks and retries', async () => {
    jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
    const event = new ServicePointsEarnedEventBuilder().build();
    const error = new Error('boom');
    useCase.execute.mockRejectedValueOnce(error);

    await expect(handler.handle(event)).rejects.toThrow(error);
  });
});
