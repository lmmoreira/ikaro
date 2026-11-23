import { addDaysUTC } from '../../../../shared/utils/calendar-date';
import { SubscriptionBuilder } from '../../../../test/builders/billing';
import {
  createRemindersHarness,
  REMINDERS_NOW,
  REMINDERS_TODAY,
  saoPauloMidnight,
} from '../../../../test/infrastructure/billing-reminders-harness';
import type { Subscription } from '../../domain/subscription.aggregate';

const day = (offset: number): string => addDaysUTC(REMINDERS_TODAY, offset);
const DAY_MS = 24 * 60 * 60 * 1000;

describe('PublishSubscriptionRemindersUseCase (UC-139)', () => {
  let h: ReturnType<typeof createRemindersHarness>;
  const frozen = new Set<string>();

  beforeEach(() => {
    h = createRemindersHarness();
  });

  const run = (subscription: Subscription, frozenProfileKeys: ReadonlySet<string> = frozen) =>
    h.publishOne.execute({
      tenantId: subscription.tenantId,
      correlationId: 'corr-reminders',
      frozenProfileKeys,
    });

  const trialEndingIn = (days: number, confirmed = false): Subscription => {
    const builder = new SubscriptionBuilder()
      .withStatus('TRIALING')
      .withTrialEndsAt(saoPauloMidnight(day(days)));
    if (confirmed) builder.withPlanConfirmedAt(REMINDERS_NOW);
    return builder.build();
  };
  const active = (): Subscription => new SubscriptionBuilder().withStatus('ACTIVE').build();
  const pastDue = (since: Date, graceUntil: Date | null = null): Subscription =>
    new SubscriptionBuilder()
      .withStatus('PAST_DUE')
      .withPastDueSince(since)
      .withGraceUntil(graceUntil)
      .build();
  const suspended = (reason: 'NON_PAYMENT' | 'PAYMENT_REVERSED' | 'CANCELED' | 'OPERATOR') =>
    new SubscriptionBuilder()
      .withSuspension(reason, new Date(REMINDERS_NOW.getTime() - DAY_MS))
      .build();

  it('answers NOT_FOUND for a tenant with no subscription and publishes nothing', async () => {
    const result = await h.publishOne.execute({
      tenantId: 'no-such-tenant',
      correlationId: 'corr-reminders',
      frozenProfileKeys: frozen,
    });

    expect(result).toEqual({ outcome: 'NOT_FOUND', published: [], skippedFrozen: 0 });
    expect(h.commands()).toEqual([]);
  });

  it('never publishes for an exempt subscription, whatever dates it has', async () => {
    const subscription = new SubscriptionBuilder()
      .withStatus('TRIALING')
      .withExempt(true)
      .withTrialEndsAt(saoPauloMidnight(day(7)))
      .build();
    await h.seedTenant(subscription);

    const result = await run(subscription);

    expect(result.outcome).toBe('EXEMPT');
    expect(h.commands()).toEqual([]);
    expect(h.txManager.runCallCount).toBe(0);
  });

  it('opens no transaction when nothing is due today', async () => {
    const subscription = trialEndingIn(9);
    await h.seedTenant(subscription);

    const result = await run(subscription);

    expect(result).toEqual({ outcome: 'NONE', published: [], skippedFrozen: 0 });
    expect(h.txManager.runCallCount).toBe(0);
  });

  describe('trial reminders', () => {
    it('writes PLAN_CONFIRMATION and TRIAL_ENDING 7 days before the end, with no charge id', async () => {
      const subscription = trialEndingIn(7);
      await h.seedTenant(subscription, { billingEmail: 'billing@example.test' });

      const result = await run(subscription);

      expect(result.outcome).toBe('PUBLISHED');
      expect(h.kinds()).toEqual(['PLAN_CONFIRMATION:7', 'TRIAL_ENDING:7']);
      for (const command of h.commands()) {
        expect(command.tenantId).toBe(subscription.tenantId);
        expect(command.data).toMatchObject({
          subscriptionId: subscription.id,
          chargeId: null,
          trialEndsOn: day(7),
          suspendsOn: null,
          recipientEmail: 'billing@example.test',
        });
        expect(command.correlationId).toBe('corr-reminders');
      }
    });

    it('sends no PLAN_CONFIRMATION once the plan is confirmed', async () => {
      const subscription = trialEndingIn(7, true);
      await h.seedTenant(subscription);

      await run(subscription);

      expect(h.kinds()).toEqual(['TRIAL_ENDING:7']);
    });

    it('names the trial end on the last day (offset 0)', async () => {
      const subscription = trialEndingIn(0);
      await h.seedTenant(subscription);

      await run(subscription);

      expect(h.kinds()).toEqual(['TRIAL_ENDING:0']);
    });

    it('shows the first invoice on TRIAL_ENDING when it exists, still with no charge id', async () => {
      const subscription = trialEndingIn(3);
      await h.seedTenant(subscription);
      const first = await h.seedCharge(subscription, { dueDate: day(3) });

      await run(subscription);

      expect(h.kinds()).toEqual(['TRIAL_ENDING:3']);
      expect(h.commands()[0]?.data).toMatchObject({
        chargeId: null,
        dueDate: day(3),
        amountMinor: first.amount.amountMinor,
        currency: 'BRL',
        paymentUrl: expect.stringContaining('https://pay.example/'),
      });
    });

    it("shows the current trial's invoice, not another open period charge of the subscription", async () => {
      const subscription = trialEndingIn(3);
      await h.seedTenant(subscription);
      await h.seedCharge(subscription, { dueDate: day(-30) });
      const current = await h.seedCharge(subscription, { dueDate: day(3) });

      await run(subscription);

      expect(h.kinds()).toEqual(['TRIAL_ENDING:3']);
      expect(h.commands()[0]?.data).toMatchObject({
        dueDate: day(3),
        amountMinor: current.amount.amountMinor,
      });
    });

    it('shows no invoice on TRIAL_ENDING once the first one is no longer open', async () => {
      const subscription = trialEndingIn(3);
      await h.seedTenant(subscription);
      const first = await h.seedCharge(subscription, { dueDate: day(3) });
      first.cancel();
      await h.charges.save(first);

      await run(subscription);

      expect(h.commands()[0]?.data).toMatchObject({ dueDate: null, paymentUrl: null });
    });

    it('keys a trial reminder on the trial end date, so a second trial on the same subscription is not silenced', async () => {
      const first = trialEndingIn(7);
      await h.seedTenant(first);
      await run(first);
      // Exempt, then cleared: the same subscription starts a new trial that ends on another date.
      h.clock.advanceMs(40 * DAY_MS);
      const second = new SubscriptionBuilder()
        .withId(first.id)
        .withTenantId(first.tenantId)
        .withStatus('TRIALING')
        .withTrialEndsAt(saoPauloMidnight(addDaysUTC(day(40), 7)))
        .withVersion(1)
        .build();
      h.subscriptions.saved[0] = second;

      await run(second);

      const keys = h.commands().map((command) => command.dedupKey);
      expect(keys).toHaveLength(4);
      expect(new Set(keys).size).toBe(4);
    });

    it('gives the same dedup key whether or not the first invoice exists yet', async () => {
      const without = trialEndingIn(3);
      await h.seedTenant(without);
      await run(without);
      const withInvoice = trialEndingIn(3);
      await h.seedTenant(withInvoice);
      await h.seedCharge(withInvoice, { dueDate: day(3) });
      await run(withInvoice);

      const [first, second] = h.commands();
      expect(first?.dedupKey.split(':').slice(3)).toEqual(second?.dedupKey.split(':').slice(3));
    });

    it('sends no CHARGE_DUE_SOON for the first trial charge (TRIAL_ENDING covers it)', async () => {
      const subscription = trialEndingIn(3);
      await h.seedTenant(subscription);
      await h.seedCharge(subscription, { dueDate: day(3) });

      await run(subscription);

      expect(h.kinds()).not.toContain('CHARGE_DUE_SOON:3');
    });
  });

  describe('the calendar day of a zone that is not São Paulo', () => {
    it('counts the days to the trial end on the local date, across a daylight-saving change', async () => {
      // 22:00 on 2026-11-01 in New York (the night daylight saving ended) is already 2026-11-02 UTC.
      // The trial closes at local midnight on 2026-11-08 (05:00Z, standard time): 7 local days away,
      // where a UTC date would count 6 and miss the 7-day milestone.
      h.clock.setTo(new Date('2026-11-02T03:00:00Z'));
      const subscription = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTimezone('America/New_York')
        .withTrialEndsAt(new Date('2026-11-08T05:00:00Z'))
        .build();
      await h.seedTenant(subscription);

      await run(subscription);

      expect(h.kinds()).toEqual(['PLAN_CONFIRMATION:7', 'TRIAL_ENDING:7']);
      expect(h.commands()[0]?.data.trialEndsOn).toBe('2026-11-08');
    });
  });

  describe('charge reminders', () => {
    it('writes CHARGE_DUE_SOON 3 days before a renewal charge is due, with its amount and link', async () => {
      const subscription = active();
      await h.seedTenant(subscription);
      const charge = await h.seedCharge(subscription, { dueDate: day(3) });

      await run(subscription);

      expect(h.kinds()).toEqual(['CHARGE_DUE_SOON:3']);
      expect(h.commands()[0]?.data).toMatchObject({
        chargeId: charge.id,
        dueDate: day(3),
        amountMinor: charge.amount.amountMinor,
        currency: 'BRL',
        paymentUrl: charge.paymentUrl,
        trialEndsOn: null,
        suspendsOn: null,
      });
    });

    it('still publishes when the charge has no payment link yet (null link)', async () => {
      const subscription = active();
      await h.seedTenant(subscription);
      await h.seedCharge(subscription, { dueDate: day(3), ready: false });

      await run(subscription);

      expect(h.kinds()).toEqual(['CHARGE_DUE_SOON:3']);
      expect(h.commands()[0]?.data.paymentUrl).toBeNull();
    });

    it.each([1, 3, 7])(
      'writes CHARGE_OVERDUE %i days after the due date without a suspension date',
      async (late) => {
        const subscription = pastDue(new Date(REMINDERS_NOW.getTime() - late * DAY_MS));
        await h.seedTenant(subscription);
        await h.seedCharge(subscription, { dueDate: day(-late), status: 'OVERDUE' });

        await run(subscription);

        expect(h.kinds()).toEqual([`CHARGE_OVERDUE:${late}`]);
        expect(h.commands()[0]?.data.suspendsOn).toBeNull();
      },
    );

    it('states the suspension date on day 12: past_due_since plus 14 days, in the tenant timezone', async () => {
      // Past due since 2026-11-28 15:00Z; the 14 days end on 2026-12-12 12:00 local.
      const since = new Date('2026-11-28T15:00:00Z');
      const subscription = pastDue(since);
      await h.seedTenant(subscription);
      await h.seedCharge(subscription, { dueDate: day(-12), status: 'OVERDUE' });

      await run(subscription);

      expect(h.kinds()).toEqual(['CHARGE_OVERDUE:12']);
      expect(h.commands()[0]?.data.suspendsOn).toBe('2026-12-12');
    });

    it('honours an operator grace_until in the suspension date', async () => {
      const subscription = pastDue(
        new Date('2026-11-28T15:00:00Z'),
        new Date('2026-12-20T15:00:00Z'),
      );
      await h.seedTenant(subscription);
      await h.seedCharge(subscription, { dueDate: day(-12), status: 'OVERDUE' });

      await run(subscription);

      expect(h.commands()[0]?.data.suspendsOn).toBe('2026-12-20');
    });

    it('withholds the day-12 reminder while the provider account is frozen, and only that one', async () => {
      const subscription = pastDue(new Date('2026-11-28T15:00:00Z'));
      await h.seedTenant(subscription);
      await h.seedCharge(subscription, { dueDate: day(-12), status: 'OVERDUE' });
      const key = subscription.merchantProfileKey;

      const result = await run(subscription, new Set([key]));

      expect(result).toEqual({ outcome: 'NONE', published: [], skippedFrozen: 1 });
      expect(h.commands()).toEqual([]);
    });

    it('still sends the day-7 overdue reminder while frozen', async () => {
      const subscription = pastDue(new Date(REMINDERS_NOW.getTime() - 7 * DAY_MS));
      await h.seedTenant(subscription);
      await h.seedCharge(subscription, { dueDate: day(-7), status: 'OVERDUE' });

      await run(subscription, new Set([subscription.merchantProfileKey]));

      expect(h.kinds()).toEqual(['CHARGE_OVERDUE:7']);
    });

    it('does not back-fill day 12 the day after, once the freeze is cleared', async () => {
      const subscription = pastDue(new Date('2026-11-28T15:00:00Z'));
      await h.seedTenant(subscription);
      await h.seedCharge(subscription, { dueDate: day(-12), status: 'OVERDUE' });

      await run(subscription, new Set([subscription.merchantProfileKey]));
      h.clock.advanceMs(DAY_MS);
      await run(subscription, frozen);

      expect(h.commands()).toEqual([]);
    });
  });

  describe('recovery charge reminders', () => {
    it.each([
      ['3 days after issue', 4, 'RECOVERY_CHARGE_OPEN:3'],
      ['1 day after the due date', -1, 'RECOVERY_CHARGE_OPEN:8'],
      ['7 days after the due date', -7, 'RECOVERY_CHARGE_OPEN:14'],
    ])(
      'writes RECOVERY_CHARGE_OPEN %s for a non-payment suspension',
      async (_label, dueIn, expected) => {
        const subscription = suspended('NON_PAYMENT');
        await h.seedTenant(subscription);
        const recovery = await h.seedCharge(subscription, {
          kind: 'RECOVERY',
          dueDate: day(dueIn),
          status: dueIn < 0 ? 'OVERDUE' : 'PENDING',
        });

        await run(subscription);

        expect(h.kinds()).toEqual([expected]);
        expect(h.commands()[0]?.data).toMatchObject({
          chargeId: recovery.id,
          dueDate: day(dueIn),
          paymentUrl: recovery.paymentUrl,
        });
      },
    );

    it.each([-1, -7])(
      'sends no overdue recovery reminder %i days past due while the charge is still PENDING (the sweep has not marked it)',
      async (dueIn) => {
        const subscription = suspended('NON_PAYMENT');
        await h.seedTenant(subscription);
        await h.seedCharge(subscription, {
          kind: 'RECOVERY',
          dueDate: day(dueIn),
          status: 'PENDING',
        });

        await run(subscription);

        expect(h.commands()).toEqual([]);
      },
    );

    it('also reminds a PAYMENT_REVERSED suspension', async () => {
      const subscription = suspended('PAYMENT_REVERSED');
      await h.seedTenant(subscription);
      await h.seedCharge(subscription, { kind: 'RECOVERY', dueDate: day(4) });

      await run(subscription);

      expect(h.kinds()).toEqual(['RECOVERY_CHARGE_OPEN:3']);
    });

    it.each(['CANCELED', 'OPERATOR'] as const)(
      'sends nothing for a %s suspension',
      async (reason) => {
        const subscription = suspended(reason);
        await h.seedTenant(subscription);
        await h.seedCharge(subscription, { kind: 'RECOVERY', dueDate: day(4) });

        await run(subscription);

        expect(h.commands()).toEqual([]);
      },
    );

    it('stops once the recovery charge is paid or cancelled', async () => {
      const subscription = suspended('NON_PAYMENT');
      await h.seedTenant(subscription);
      const recovery = await h.seedCharge(subscription, { kind: 'RECOVERY', dueDate: day(4) });
      recovery.cancel();
      await h.charges.save(recovery);

      await run(subscription);

      expect(h.commands()).toEqual([]);
    });
  });

  describe('freshness (re-checked in the transaction that writes the rows)', () => {
    it('publishes nothing when the charge was paid between the first read and the write', async () => {
      const subscription = active();
      await h.seedTenant(subscription);
      await h.seedCharge(subscription, { dueDate: day(3) });
      const real = h.charges.findOpenByTenant.bind(h.charges);
      // The first read still sees it open; the read inside the transaction finds it settled.
      jest.spyOn(h.charges, 'findOpenByTenant').mockImplementationOnce(real).mockResolvedValue([]);

      const result = await run(subscription);

      expect(result.outcome).toBe('NONE');
      expect(h.commands()).toEqual([]);
    });

    it('publishes nothing when the subscription turned exempt between the first read and the write', async () => {
      const subscription = active();
      await h.seedTenant(subscription);
      await h.seedCharge(subscription, { dueDate: day(3) });
      const exempt = new SubscriptionBuilder()
        .withId(subscription.id)
        .withTenantId(subscription.tenantId)
        .withStatus('ACTIVE')
        .withExempt(true)
        .build();
      const real = h.subscriptions.findFreshByTenantId.bind(h.subscriptions);
      jest
        .spyOn(h.subscriptions, 'findFreshByTenantId')
        .mockImplementationOnce(real)
        .mockResolvedValue(exempt);

      const result = await run(subscription);

      expect(result.outcome).toBe('EXEMPT');
      expect(h.commands()).toEqual([]);
    });

    it('writes the rows in one transaction', async () => {
      const subscription = trialEndingIn(7);
      await h.seedTenant(subscription);

      await run(subscription);

      expect(h.txManager.runCallCount).toBe(1);
      expect(h.commands()).toHaveLength(2);
    });
  });

  describe('recipient', () => {
    it('carries a null recipient when the account has no billing email (Notification falls back to the managers)', async () => {
      const subscription = trialEndingIn(7);
      await h.seedTenant(subscription);

      await run(subscription);

      expect(h.commands().every((command) => command.data.recipientEmail === null)).toBe(true);
    });
  });

  it('writes only the commands of the tenant it was asked about, never another tenant that is also due', async () => {
    const mine = trialEndingIn(7);
    const other = trialEndingIn(7);
    await h.seedTenant(mine);
    await h.seedTenant(other);

    await run(mine);

    expect(h.commands(other.tenantId)).toEqual([]);
    expect(h.commands(mine.tenantId)).toHaveLength(2);
  });
});
