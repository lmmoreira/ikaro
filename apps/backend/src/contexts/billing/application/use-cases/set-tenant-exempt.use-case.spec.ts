import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryBillingPlatformPort } from '../../../../test/infrastructure/in-memory-billing-platform.port';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { SubscriptionBuilder } from '../../../../test/builders/billing';
import { InMemoryOperatorAuditRepository } from '../../../../test/repositories/billing/in-memory-operator-audit.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { ExemptProtectedError } from '../../domain/errors/billing-domain.error';
import { SetTenantExemptUseCase } from './set-tenant-exempt.use-case';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const SUSPENDED_AT = new Date('2026-11-01T08:00:00.000Z');
const OWNER_SLUG = 'ikaro';
const INPUT = { operator: 'Ana Souza', reason: 'partner account' };

describe('SetTenantExemptUseCase', () => {
  let outbox: InMemoryOutboxPublisher;
  let subscriptions: InMemorySubscriptionRepository;
  let audits: InMemoryOperatorAuditRepository;
  let platform: InMemoryBillingPlatformPort;
  let useCase: SetTenantExemptUseCase;

  beforeEach(() => {
    outbox = new InMemoryOutboxPublisher();
    subscriptions = new InMemorySubscriptionRepository(outbox);
    audits = new InMemoryOperatorAuditRepository();
    platform = new InMemoryBillingPlatformPort();
    useCase = new SetTenantExemptUseCase(
      subscriptions,
      audits,
      new InMemoryTransactionManager(),
      new AdvanceableClock(NOW),
      platform,
      { appEnv: 'local', platformOwnerSlug: OWNER_SLUG },
    );
  });

  const seedTenant = (slug: string, tenantId: string): void =>
    platform.seed({
      tenantId,
      slug,
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      createdAt: NOW,
    });

  it('sets exempt on a trialing tenant: ACTIVE and exempt, audited', async () => {
    const subscription = new SubscriptionBuilder().withStatus('TRIALING').build();
    await subscriptions.save(subscription);

    const result = await useCase.execute({
      tenantId: subscription.tenantId,
      ...INPUT,
      exempt: true,
    });

    expect(result).toMatchObject({ status: 'ACTIVE', exempt: true });
    expect(audits.saved[0]).toMatchObject({ action: 'SET_EXEMPT', details: { exempt: true } });
    expect(outbox.published).toHaveLength(0);
  });

  it('reactivates a suspended tenant without payment and publishes SubscriptionReactivated (UC-137 A3)', async () => {
    const subscription = new SubscriptionBuilder()
      .withSuspension('NON_PAYMENT', SUSPENDED_AT)
      .build();
    await subscriptions.save(subscription);

    const result = await useCase.execute({
      tenantId: subscription.tenantId,
      ...INPUT,
      exempt: true,
    });

    expect(result).toMatchObject({ status: 'ACTIVE', suspensionReason: null, exempt: true });
    expect(outbox.published).toHaveLength(1);
    expect(outbox.published[0]).toMatchObject({
      eventName: 'SubscriptionReactivated',
      data: { suspendedAt: SUSPENDED_AT.toISOString(), reactivatedAt: NOW.toISOString() },
    });
  });

  it('clears exempt into a fresh trial and audits it', async () => {
    const subscription = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();
    await subscriptions.save(subscription);
    seedTenant('lavacar', subscription.tenantId);

    const result = await useCase.execute({
      tenantId: subscription.tenantId,
      ...INPUT,
      exempt: false,
    });

    expect(result).toMatchObject({ status: 'TRIALING', exempt: false });
    expect(audits.saved[0]).toMatchObject({ details: { exempt: false } });
  });

  it("refuses to clear exempt on Ikaro's own tenant with no audit row", async () => {
    const subscription = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();
    await subscriptions.save(subscription);
    seedTenant(OWNER_SLUG, subscription.tenantId);

    await expect(
      useCase.execute({ tenantId: subscription.tenantId, ...INPUT, exempt: false }),
    ).rejects.toThrow(ExemptProtectedError);

    expect(audits.saved).toHaveLength(0);
  });

  it('is a no-op with no audit row when the tenant is already in the requested state', async () => {
    const exempt = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();
    const paying = new SubscriptionBuilder().withStatus('ACTIVE').build();
    await subscriptions.save(exempt);
    await subscriptions.save(paying);
    seedTenant('lavacar', exempt.tenantId);
    seedTenant('outro', paying.tenantId);

    await useCase.execute({ tenantId: exempt.tenantId, ...INPUT, exempt: true });
    await useCase.execute({ tenantId: paying.tenantId, ...INPUT, exempt: false });

    expect(audits.saved).toHaveLength(0);
  });

  it('does not look the tenant up when setting exempt (only a clear needs the owner check)', async () => {
    const subscription = new SubscriptionBuilder().withStatus('TRIALING').build();
    await subscriptions.save(subscription);

    await useCase.execute({ tenantId: subscription.tenantId, ...INPUT, exempt: true });

    expect(platform.lookups).toHaveLength(0);
  });
});
