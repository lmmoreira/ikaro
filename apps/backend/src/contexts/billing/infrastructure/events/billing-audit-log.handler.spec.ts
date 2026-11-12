import { LogDomainEventUseCase } from '../../../../shared/application/use-cases/log-domain-event.use-case';
import { Envelope } from '../../../../shared/domain/envelope';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  SubscriptionReactivatedEventBuilder,
  SubscriptionSuspendedEventBuilder,
} from '../../../../test/builders/billing';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { BillingAuditLogHandler } from './billing-audit-log.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000115';

// Every domain event the billing context owns, each built by its real builder. The set is pinned
// here and kept in step with the handler by architecture-check's domain-event-audit-coverage
// detector.
const EVENT_BUILDERS: Record<string, () => Envelope> = {
  SubscriptionSuspended: () =>
    new SubscriptionSuspendedEventBuilder().withTenantId(TENANT_ID).build(),
  SubscriptionReactivated: () =>
    new SubscriptionReactivatedEventBuilder().withTenantId(TENANT_ID).build(),
};
const EVENT_NAMES = Object.keys(EVENT_BUILDERS);

describe('BillingAuditLogHandler', () => {
  let handler: BillingAuditLogHandler;
  let useCase: jest.Mocked<Pick<LogDomainEventUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;

  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue(undefined) };
    eventBus = new InMemoryEventBus();
    handler = new BillingAuditLogHandler(useCase as unknown as LogDomainEventUseCase, eventBus);
  });

  it('subscribes to exactly the 2 billing domain events, all with the audit-log consumer name', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions.map((s) => s.eventName).sort()).toEqual([...EVENT_NAMES].sort());
    expect(new Set(eventBus.subscriptions.map((s) => s.consumerName))).toEqual(
      new Set([LogDomainEventUseCase.CONSUMER_NAME]),
    );
  });

  it.each(EVENT_NAMES)(
    'routes %s to the log use case with its envelope fields and its own correlationId',
    async (eventName) => {
      handler.onModuleInit();
      const event = EVENT_BUILDERS[eventName]();
      const subscription = eventBus.subscriptions.find((s) => s.eventName === eventName);

      await subscription?.handler(event);

      expect(subscription).toBeDefined();
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
    const error = new Error('boom');
    useCase.execute.mockRejectedValueOnce(error);

    await expect(handler.handle(EVENT_BUILDERS[EVENT_NAMES[0]]())).rejects.toThrow(error);
  });
});
