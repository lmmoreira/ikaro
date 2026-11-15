import { SubscriptionSuspendedEventBuilder } from '../../../../test/builders/billing/subscription-suspended-event.builder';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { RevalidateTenantHotsiteUseCase } from '../../application/use-cases/revalidate-tenant-hotsite.use-case';
import { SubscriptionSuspendedHotsiteRevalidationHandler } from './subscription-suspended-hotsite-revalidation.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CORRELATION_ID = '00000000-0000-7000-8000-000000000099';

describe('SubscriptionSuspendedHotsiteRevalidationHandler', () => {
  let useCase: jest.Mocked<Pick<RevalidateTenantHotsiteUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: SubscriptionSuspendedHotsiteRevalidationHandler;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ revalidated: true }) };
    eventBus = new InMemoryEventBus();
    handler = new SubscriptionSuspendedHotsiteRevalidationHandler(
      useCase as unknown as RevalidateTenantHotsiteUseCase,
      eventBus,
    );
  });

  it('subscribes to SubscriptionSuspended with its own consumer name and skipWhenSuspended: false', () => {
    const spy = jest.spyOn(eventBus, 'subscribe');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledWith(
      'SubscriptionSuspended',
      expect.any(Function),
      'revalidate-hotsite-on-suspension',
      { skipWhenSuspended: false },
    );
  });

  it('calls RevalidateTenantHotsiteUseCase exactly once with the tenant and correlation ids', async () => {
    const event = new SubscriptionSuspendedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      correlationId: CORRELATION_ID,
    });
  });
});
