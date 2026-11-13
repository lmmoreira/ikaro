import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { SubscriptionBuilder } from '../../../../test/builders/billing';
import { InMemoryOperatorAuditRepository } from '../../../../test/repositories/billing/in-memory-operator-audit.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import {
  BillingTenantNotFoundError,
  GraceNotAllowedError,
} from '../../domain/errors/billing-domain.error';
import { ExtendGraceUseCase } from './extend-grace.use-case';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const PAST_DUE_SINCE = new Date('2026-11-05T12:00:00.000Z'); // + 14 days = 2026-11-19
const INPUT = { operator: 'Ana Souza', reason: 'customer promised payment' };

describe('ExtendGraceUseCase', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let audits: InMemoryOperatorAuditRepository;
  let useCase: ExtendGraceUseCase;

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    audits = new InMemoryOperatorAuditRepository();
    useCase = new ExtendGraceUseCase(
      subscriptions,
      audits,
      new InMemoryTransactionManager(),
      new AdvanceableClock(NOW),
    );
  });

  const seedPastDue = async (): Promise<string> => {
    const subscription = new SubscriptionBuilder()
      .withStatus('PAST_DUE')
      .withPastDueSince(PAST_DUE_SINCE)
      .build();
    await subscriptions.save(subscription);
    return subscription.tenantId;
  };

  it('sets graceUntil on a PAST_DUE tenant and audits it', async () => {
    const tenantId = await seedPastDue();

    const result = await useCase.execute({
      tenantId,
      ...INPUT,
      graceUntil: '2026-11-30T00:00:00.000Z',
    });

    expect(result.graceUntil).toBe('2026-11-30T00:00:00.000Z');
    expect(audits.saved).toHaveLength(1);
    expect(audits.saved[0]).toMatchObject({
      action: 'GRACE',
      details: { graceUntil: '2026-11-30T00:00:00.000Z' },
    });
  });

  it('rejects a tenant that is not PAST_DUE with BILLING_GRACE_NOT_ALLOWED (UC-111 A1)', async () => {
    const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
    await subscriptions.save(subscription);

    await expect(
      useCase.execute({
        tenantId: subscription.tenantId,
        ...INPUT,
        graceUntil: '2026-11-30T00:00:00.000Z',
      }),
    ).rejects.toThrow(GraceNotAllowedError);
    expect(audits.saved).toHaveLength(0);
  });

  it('rejects a grace that would shorten the 14 days', async () => {
    const tenantId = await seedPastDue();

    await expect(
      useCase.execute({ tenantId, ...INPUT, graceUntil: '2026-11-10T00:00:00.000Z' }),
    ).rejects.toThrow(GraceNotAllowedError);
    expect(audits.saved).toHaveLength(0);
  });

  it('rejects a grace earlier than one already set (it only ever extends)', async () => {
    const tenantId = await seedPastDue();
    await useCase.execute({ tenantId, ...INPUT, graceUntil: '2026-11-30T00:00:00.000Z' });

    await expect(
      useCase.execute({ tenantId, ...INPUT, graceUntil: '2026-11-25T00:00:00.000Z' }),
    ).rejects.toThrow(GraceNotAllowedError);

    expect(subscriptions.saved[0]?.graceUntil?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
    expect(audits.saved).toHaveLength(1);
  });

  it('writes no second audit row when the same instant is set again', async () => {
    const tenantId = await seedPastDue();
    const input = { tenantId, ...INPUT, graceUntil: '2026-11-30T00:00:00.000Z' };

    await useCase.execute(input);
    await useCase.execute(input);

    expect(audits.saved).toHaveLength(1);
  });

  it("never touches another tenant's subscription: a request for tenant B leaves tenant A alone", async () => {
    const tenantA = await seedPastDue();

    await expect(
      useCase.execute({
        tenantId: '0197b0a0-0000-7000-8000-0000000000b2',
        ...INPUT,
        graceUntil: '2026-11-30T00:00:00.000Z',
      }),
    ).rejects.toThrow(BillingTenantNotFoundError);

    expect(subscriptions.saved.find((row) => row.tenantId === tenantA)?.graceUntil).toBeNull();
    expect(audits.saved).toHaveLength(0);
  });
});
