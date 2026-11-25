import { ChargeBuilder, SubscriptionBuilder } from '../../../../test/builders/billing';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { InMemoryChargeRepository } from '../../../../test/repositories/billing/in-memory-charge.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { ListTenantBillingStatusUseCase } from './list-tenant-billing-status.use-case';

// 02:30 UTC on the 12th is still the 11th in São Paulo (UTC-3): the overdue age is counted in the
// subscription's own zone, not in UTC.
const NOW = new Date('2026-11-12T02:30:00.000Z');

describe('ListTenantBillingStatusUseCase', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let charges: InMemoryChargeRepository;
  let useCase: ListTenantBillingStatusUseCase;

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    charges = new InMemoryChargeRepository();
    useCase = new ListTenantBillingStatusUseCase(subscriptions, charges, new FixedClock(NOW));
  });

  it('returns the subscription facts as ISO strings with the pagination envelope, and nulls without a charge', async () => {
    const suspendedAt = new Date('2026-11-01T08:00:00.000Z');
    const subscription = new SubscriptionBuilder()
      .withSuspension('OPERATOR', suspendedAt)
      .withTrialEndsAt(null)
      .build();
    await subscriptions.save(subscription);

    const result = await useCase.execute({ limit: 25, offset: 0 });

    expect(result.pagination).toEqual({ limit: 25, offset: 0, total: 1, hasMore: false });
    expect(result.items).toEqual([
      {
        tenantId: subscription.tenantId,
        status: 'SUSPENDED',
        suspensionReason: 'OPERATOR',
        exempt: false,
        trialEndsAt: null,
        graceUntil: null,
        pastDueSince: null,
        suspendedAt: suspendedAt.toISOString(),
        hasEverPaid: false,
        overdueDays: null,
        lastCharge: null,
        openRecovery: null,
      },
    ]);
  });

  it('narrows to one status and pages with hasMore', async () => {
    for (let i = 0; i < 3; i += 1) {
      await subscriptions.save(new SubscriptionBuilder().withStatus('ACTIVE').build());
    }
    await subscriptions.save(new SubscriptionBuilder().withStatus('PAST_DUE').build());

    const page = await useCase.execute({ status: 'ACTIVE', limit: 2, offset: 0 });
    const rest = await useCase.execute({ status: 'ACTIVE', limit: 2, offset: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.pagination).toMatchObject({ total: 3, hasMore: true });
    expect(rest.items).toHaveLength(1);
    expect(rest.pagination.hasMore).toBe(false);
    expect([...page.items, ...rest.items].every((item) => item.status === 'ACTIVE')).toBe(true);
  });

  describe('Charge-derived fields', () => {
    it('gives a PAST_DUE tenant its overdue age (local days, oldest overdue charge), last charge and no recovery', async () => {
      const subscription = new SubscriptionBuilder().withStatus('PAST_DUE').build();
      await subscriptions.save(subscription);
      const tenantId = subscription.tenantId;
      await charges.save(
        new ChargeBuilder()
          .withTenantId(tenantId)
          .withPeriod('2026-10-01', '2026-10-31')
          .withDueDate('2026-10-02')
          .withStatus('OVERDUE')
          .build(),
      );
      const latest = new ChargeBuilder()
        .withTenantId(tenantId)
        .withPeriod('2026-11-01', '2026-11-30')
        .withDueDate('2026-11-05')
        .withStatus('OVERDUE')
        .build();
      await charges.save(latest);

      const { items } = await useCase.execute({ limit: 25, offset: 0 });

      // Local today is 2026-11-11 (São Paulo): 2026-10-02 is 40 days back, not 41.
      expect(items[0].overdueDays).toBe(40);
      expect(items[0].lastCharge).toEqual({
        id: latest.id,
        kind: 'PERIOD',
        status: 'OVERDUE',
        amountMinor: latest.amount.amountMinor,
        currency: 'BRL',
        dueDate: '2026-11-05',
      });
      expect(items[0].openRecovery).toBeNull();
    });

    it('gives a SUSPENDED tenant its open recovery charge and ignores a CANCELED charge as the last one', async () => {
      const subscription = new SubscriptionBuilder()
        .withSuspension('NON_PAYMENT', new Date('2026-11-01T00:00:00.000Z'))
        .build();
      await subscriptions.save(subscription);
      const tenantId = subscription.tenantId;
      const period = new ChargeBuilder()
        .withTenantId(tenantId)
        // Newer than the recovery charge: only the CANCELED filter keeps it from being "last".
        .withDueDate('2026-11-20')
        .withStatus('CANCELED')
        .build();
      const recovery = new ChargeBuilder()
        .withTenantId(tenantId)
        .asRecovery()
        .withDueDate('2026-11-08')
        .build();
      await charges.save(period);
      await charges.save(recovery);

      const { items } = await useCase.execute({ limit: 25, offset: 0 });

      expect(items[0].openRecovery).toMatchObject({ id: recovery.id, kind: 'RECOVERY' });
      expect(items[0].lastCharge?.id).toBe(recovery.id);
      expect(items[0].overdueDays).toBeNull();
    });

    it('never gives one tenant another tenant’s charge facts', async () => {
      const a = new SubscriptionBuilder().withStatus('PAST_DUE').build();
      const b = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await subscriptions.save(a);
      await subscriptions.save(b);
      await charges.save(
        new ChargeBuilder()
          .withTenantId(a.tenantId)
          .withDueDate('2026-10-02')
          .withStatus('OVERDUE')
          .build(),
      );

      const { items } = await useCase.execute({ limit: 25, offset: 0 });

      const rowB = items.find((item) => item.tenantId === b.tenantId);
      expect(rowB).toMatchObject({ overdueDays: null, lastCharge: null, openRecovery: null });
    });

    it('asks the charge repository once per page, not once per row', async () => {
      for (let i = 0; i < 3; i += 1) {
        await subscriptions.save(new SubscriptionBuilder().withStatus('ACTIVE').build());
      }
      const spy = jest.spyOn(charges, 'summarizeForOperator');

      await useCase.execute({ limit: 25, offset: 0 });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toHaveLength(3);
    });
  });
});
