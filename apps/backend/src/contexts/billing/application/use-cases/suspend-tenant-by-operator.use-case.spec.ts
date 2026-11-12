import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { SubscriptionBuilder } from '../../../../test/builders/billing';
import { InMemoryOperatorAuditRepository } from '../../../../test/repositories/billing/in-memory-operator-audit.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import {
  BillingTenantNotFoundError,
  ExemptProtectedError,
} from '../../domain/errors/billing-domain.error';
import { SuspendTenantByOperatorUseCase } from './suspend-tenant-by-operator.use-case';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const INPUT = { operator: 'Ana Souza', reason: 'abuse report #42' };

describe('SuspendTenantByOperatorUseCase', () => {
  let outbox: InMemoryOutboxPublisher;
  let subscriptions: InMemorySubscriptionRepository;
  let audits: InMemoryOperatorAuditRepository;
  let useCase: SuspendTenantByOperatorUseCase;

  beforeEach(() => {
    outbox = new InMemoryOutboxPublisher();
    subscriptions = new InMemorySubscriptionRepository(outbox);
    audits = new InMemoryOperatorAuditRepository();
    useCase = new SuspendTenantByOperatorUseCase(
      subscriptions,
      audits,
      new InMemoryTransactionManager(),
      new AdvanceableClock(NOW),
    );
  });

  it('suspends an active tenant, audits who and why, and publishes SubscriptionSuspended', async () => {
    const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
    await subscriptions.save(subscription);
    outbox.published.length = 0;

    const result = await useCase.execute({ tenantId: subscription.tenantId, ...INPUT });

    expect(result).toEqual({
      status: 'SUSPENDED',
      suspensionReason: 'OPERATOR',
      exempt: false,
      graceUntil: null,
    });
    expect(audits.saved).toHaveLength(1);
    expect(audits.saved[0]).toMatchObject({
      tenantId: subscription.tenantId,
      actor: 'Ana Souza',
      action: 'SUSPEND',
      reason: 'abuse report #42',
    });
    expect(outbox.published).toHaveLength(1);
    expect(outbox.published[0]).toMatchObject({
      eventName: 'SubscriptionSuspended',
      tenantId: subscription.tenantId,
      data: { reason: 'OPERATOR', suspendedAt: NOW.toISOString() },
    });
  });

  it('refuses an exempt tenant with no audit row and no event', async () => {
    const subscription = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();
    await subscriptions.save(subscription);
    outbox.published.length = 0;

    await expect(useCase.execute({ tenantId: subscription.tenantId, ...INPUT })).rejects.toThrow(
      ExemptProtectedError,
    );

    expect(audits.saved).toHaveLength(0);
    expect(outbox.published).toHaveLength(0);
  });

  it('turns a payment suspension into an OPERATOR one: audited, but no new SubscriptionSuspended', async () => {
    const suspendedAt = new Date('2026-10-01T00:00:00.000Z');
    const subscription = new SubscriptionBuilder()
      .withSuspension('NON_PAYMENT', suspendedAt)
      .build();
    await subscriptions.save(subscription);
    outbox.published.length = 0;

    const result = await useCase.execute({ tenantId: subscription.tenantId, ...INPUT });

    expect(result.suspensionReason).toBe('OPERATOR');
    expect(subscriptions.saved[0]?.suspendedAt).toEqual(suspendedAt);
    expect(audits.saved).toHaveLength(1);
    expect(outbox.published).toHaveLength(0);
  });

  it('is a no-op with no audit row and no event for a tenant already suspended by the operator', async () => {
    const subscription = new SubscriptionBuilder()
      .withSuspension('OPERATOR', new Date('2026-10-01T00:00:00.000Z'))
      .build();
    await subscriptions.save(subscription);
    outbox.published.length = 0;

    const result = await useCase.execute({ tenantId: subscription.tenantId, ...INPUT });

    expect(result.suspensionReason).toBe('OPERATOR');
    expect(audits.saved).toHaveLength(0);
    expect(outbox.published).toHaveLength(0);
  });

  it('answers a typed not-found for a tenant with no subscription', async () => {
    await expect(
      useCase.execute({ tenantId: '0197b0a0-0000-7000-8000-000000000001', ...INPUT }),
    ).rejects.toThrow(BillingTenantNotFoundError);
  });
});
