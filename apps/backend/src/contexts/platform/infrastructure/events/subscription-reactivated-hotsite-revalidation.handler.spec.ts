import { SubscriptionReactivatedEventBuilder } from '../../../../test/builders/billing/subscription-reactivated-event.builder';
import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryFrontendRevalidationPort } from '../../../../test/infrastructure/in-memory-frontend-revalidation.port';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { RevalidateTenantHotsiteUseCase } from '../../application/use-cases/revalidate-tenant-hotsite.use-case';
import { SubscriptionReactivatedHotsiteRevalidationHandler } from './subscription-reactivated-hotsite-revalidation.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-7000-8000-000000000002';
const CORRELATION_ID = '00000000-0000-7000-8000-000000000099';

describe('SubscriptionReactivatedHotsiteRevalidationHandler', () => {
  let revalidation: InMemoryFrontendRevalidationPort;
  let eventBus: InMemoryEventBus;
  let handler: SubscriptionReactivatedHotsiteRevalidationHandler;

  beforeEach(async () => {
    const tenantRepo = new InMemoryTenantRepository();
    await tenantRepo.save(new TenantBuilder().withId(TENANT_ID).withSlug('lava-rapido').build());
    await tenantRepo.save(
      new TenantBuilder().withId(OTHER_TENANT_ID).withSlug('lava-outro').build(),
    );
    revalidation = new InMemoryFrontendRevalidationPort();
    eventBus = new InMemoryEventBus();
    handler = new SubscriptionReactivatedHotsiteRevalidationHandler(
      new RevalidateTenantHotsiteUseCase(tenantRepo, revalidation),
      eventBus,
    );
  });

  it('subscribes to SubscriptionReactivated with its own consumer name and skipWhenSuspended: false', () => {
    const spy = jest.spyOn(eventBus, 'subscribe');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledWith(
      'SubscriptionReactivated',
      expect.any(Function),
      'revalidate-hotsite-on-reactivation',
      { skipWhenSuspended: false },
    );
  });

  it("revalidates the reactivated tenant's hotsite, and only that tenant's", async () => {
    const event = new SubscriptionReactivatedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .build();

    await handler.handle(event);

    expect(revalidation.revalidatedSlugs).toEqual(['lava-rapido']);
  });
});
