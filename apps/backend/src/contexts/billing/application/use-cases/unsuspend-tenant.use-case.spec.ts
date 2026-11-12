import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { SubscriptionBuilder } from '../../../../test/builders/billing';
import { InMemoryOperatorAuditRepository } from '../../../../test/repositories/billing/in-memory-operator-audit.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { UnsuspendNotAllowedError } from '../../domain/errors/billing-domain.error';
import { UnsuspendTenantUseCase } from './unsuspend-tenant.use-case';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const SUSPENDED_AT = new Date('2026-11-01T08:00:00.000Z');
const INPUT = { operator: 'Ana Souza', reason: 'false positive' };

describe('UnsuspendTenantUseCase', () => {
  let outbox: InMemoryOutboxPublisher;
  let subscriptions: InMemorySubscriptionRepository;
  let audits: InMemoryOperatorAuditRepository;
  let useCase: UnsuspendTenantUseCase;

  beforeEach(() => {
    outbox = new InMemoryOutboxPublisher();
    subscriptions = new InMemorySubscriptionRepository(outbox);
    audits = new InMemoryOperatorAuditRepository();
    useCase = new UnsuspendTenantUseCase(
      subscriptions,
      audits,
      new InMemoryTransactionManager(),
      new AdvanceableClock(NOW),
    );
  });

  it('lifts an OPERATOR suspension, audits it and publishes SubscriptionReactivated with the span start', async () => {
    const subscription = new SubscriptionBuilder().withSuspension('OPERATOR', SUSPENDED_AT).build();
    await subscriptions.save(subscription);

    const result = await useCase.execute({ tenantId: subscription.tenantId, ...INPUT });

    expect(result.status).not.toBe('SUSPENDED');
    expect(result.suspensionReason).toBeNull();
    expect(audits.saved).toHaveLength(1);
    expect(audits.saved[0]).toMatchObject({ action: 'UNSUSPEND', actor: 'Ana Souza' });
    expect(outbox.published).toHaveLength(1);
    expect(outbox.published[0]).toMatchObject({
      eventName: 'SubscriptionReactivated',
      data: { reactivatedAt: NOW.toISOString(), suspendedAt: SUSPENDED_AT.toISOString() },
    });
  });

  it('refuses to reactivate a payment-based suspension, with no audit row and no event', async () => {
    const subscription = new SubscriptionBuilder()
      .withSuspension('NON_PAYMENT', SUSPENDED_AT)
      .build();
    await subscriptions.save(subscription);

    await expect(useCase.execute({ tenantId: subscription.tenantId, ...INPUT })).rejects.toThrow(
      UnsuspendNotAllowedError,
    );

    expect(audits.saved).toHaveLength(0);
    expect(outbox.published).toHaveLength(0);
  });

  it('refuses a tenant that is not suspended', async () => {
    const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
    await subscriptions.save(subscription);

    await expect(useCase.execute({ tenantId: subscription.tenantId, ...INPUT })).rejects.toThrow(
      UnsuspendNotAllowedError,
    );
  });
});
