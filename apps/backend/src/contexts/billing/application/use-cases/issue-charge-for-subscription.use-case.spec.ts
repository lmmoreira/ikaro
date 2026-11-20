import {
  FeaturePriceBuilder,
  FeaturePriceVersionBuilder,
  SubscriptionBuilder,
} from '../../../../test/builders/billing';
import { createIssueHarness } from '../../../../test/infrastructure/billing-issue-harness';
import type { Subscription } from '../../domain/subscription.aggregate';

// The harness clock is 12:00 São Paulo on 2026-03-10, so a 10-day lead reaches a due date of 03-20.
const DUE_IN_LEAD = '2026-03-20';

describe('IssueChargeForSubscriptionUseCase (UC-113)', () => {
  let h: ReturnType<typeof createIssueHarness>;

  beforeEach(() => {
    h = createIssueHarness();
  });

  const activeSubscription = (nextDueDate: string = DUE_IN_LEAD): SubscriptionBuilder =>
    new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withAnchorDay(20)
      .withNextDueDate(nextDueDate)
      .withItems([h.hotsiteItem()]);

  const issue = (subscription: Subscription) =>
    h.issueOne.execute({ tenantId: subscription.tenantId, correlationId: 'corr-1' });

  const storedCharges = (subscription: Subscription) =>
    h.charges.saved.filter((charge) => charge.tenantId === subscription.tenantId);

  it('issues exactly one charge with a payment link, advances the due date, and announces it once', async () => {
    const subscription = activeSubscription().build();
    await h.seedTenant(subscription);

    await expect(issue(subscription)).resolves.toEqual({ outcome: 'ISSUED', creation: 'READY' });

    const [charge, ...others] = storedCharges(subscription);
    expect(others).toHaveLength(0);
    expect(charge.kind).toBe('PERIOD');
    expect(charge.periodStart?.value).toBe('2026-03-20');
    expect(charge.periodEnd?.value).toBe('2026-04-19');
    expect(charge.dueDate.value).toBe('2026-03-20');
    expect(charge.amount.amountMinor).toBe(4900);
    expect(charge.providerCreationStatus).toBe('READY');
    expect(charge.paymentUrl).not.toBeNull();
    expect(subscription.nextDueDate?.value).toBe('2026-04-20');
    expect(h.outbox.published.filter((e) => e.eventName === 'ChargeIssued')).toHaveLength(1);
  });

  it('A3: running twice, or crashing after the insert, never creates a second charge', async () => {
    const subscription = activeSubscription().build();
    await h.seedTenant(subscription);

    await issue(subscription);
    await expect(issue(subscription)).resolves.toEqual({ outcome: 'NOT_DUE' });

    expect(storedCharges(subscription)).toHaveLength(1);
    expect(h.provider.charges.size).toBe(1);
  });

  it('a provider failure leaves the charge PENDING and unannounced; the retry creates it without a duplicate', async () => {
    const subscription = activeSubscription().build();
    await h.seedTenant(subscription);
    h.provider.failNextCall('UNAVAILABLE');

    await expect(issue(subscription)).resolves.toEqual({
      outcome: 'ISSUED',
      creation: 'PROVIDER_FAILED',
    });
    expect(storedCharges(subscription)[0].providerCreationStatus).toBe('PENDING');
    expect(h.outbox.published.filter((e) => e.eventName === 'ChargeIssued')).toHaveLength(0);

    h.clock.advanceMs(11 * 60_000);
    await h.retry.execute({ correlationId: 'corr-2' });

    expect(storedCharges(subscription)).toHaveLength(1);
    expect(storedCharges(subscription)[0].providerCreationStatus).toBe('READY');
    expect(h.provider.charges.size).toBe(1);
    expect(h.outbox.published.filter((e) => e.eventName === 'ChargeIssued')).toHaveLength(1);
  });

  describe('prices are read at the start of the service period', () => {
    const seedTwoVersions = () => {
      h.prices.clear();
      h.prices.seed(
        new FeaturePriceBuilder()
          .withVersions([
            new FeaturePriceVersionBuilder()
              .withAmountMinor(4900)
              .withEffectiveFrom('2026-01-01')
              .build(),
            new FeaturePriceVersionBuilder()
              .withAmountMinor(5900)
              .withEffectiveFrom('2026-04-01')
              .build(),
          ])
          .build(),
      );
    };

    it('ignores a version that takes effect after the period start', async () => {
      seedTwoVersions();
      const subscription = activeSubscription('2026-03-20').build();
      await h.seedTenant(subscription);

      await issue(subscription);

      expect(storedCharges(subscription)[0].amount.amountMinor).toBe(4900);
    });

    it('an invoice issued early uses the future period price', async () => {
      seedTwoVersions();
      h.clock.setTo(new Date('2026-03-28T15:00:00Z'));
      const subscription = activeSubscription('2026-04-05').build();
      await h.seedTenant(subscription);

      await issue(subscription);

      expect(storedCharges(subscription)[0].amount.amountMinor).toBe(5900);
    });
  });

  describe('skips', () => {
    it.each([
      ['A1: an exempt subscription', activeSubscription_exempt],
      ['A4: a suspended subscription', activeSubscription_suspended],
      ['a PAST_DUE subscription (no second invoice on an unpaid one)', activeSubscription_pastDue],
    ])('%s is never invoiced', async (_name, build) => {
      const subscription = build(h).build();
      await h.seedTenant(subscription);

      await expect(issue(subscription)).resolves.toEqual({ outcome: 'NOT_DUE' });

      expect(storedCharges(subscription)).toHaveLength(0);
    });

    it('A5: a period that starts at or after cancelAt is not invoiced', async () => {
      const subscription = activeSubscription()
        .withCancelAt(new Date('2026-03-20T03:00:00Z'))
        .build();
      await h.seedTenant(subscription);

      await expect(issue(subscription)).resolves.toEqual({ outcome: 'NOT_DUE' });

      expect(storedCharges(subscription)).toHaveLength(0);
    });

    it('A11: a deactivated tenant is never invoiced', async () => {
      const subscription = activeSubscription().build();
      await h.seedTenant(subscription, { active: false });

      await expect(issue(subscription)).resolves.toEqual({ outcome: 'TENANT_INACTIVE' });

      expect(storedCharges(subscription)).toHaveLength(0);
      expect(subscription.nextDueDate?.value).toBe(DUE_IN_LEAD);
    });

    it('a profile with no adapter yet is skipped before anything is inserted', async () => {
      const subscription = activeSubscription().withMerchantProfileKey('USD_FAKE').build();
      await h.seedTenant(subscription);

      await expect(issue(subscription)).resolves.toEqual({ outcome: 'PROVIDER_UNSUPPORTED' });

      expect(storedCharges(subscription)).toHaveLength(0);
      expect(subscription.nextDueDate?.value).toBe(DUE_IN_LEAD);
    });

    it('an unknown tenant is NOT_FOUND', async () => {
      await expect(
        h.issueOne.execute({ tenantId: 'nobody', correlationId: 'corr-1' }),
      ).resolves.toEqual({ outcome: 'NOT_FOUND' });
    });
  });

  describe('holds (A8 / A9)', () => {
    it('inserts no charge and leaves the subscription due, so the next run resumes once the identity is saved', async () => {
      const subscription = activeSubscription().build();
      await h.seedTenant(subscription, { billable: false });

      await expect(issue(subscription)).resolves.toEqual({ outcome: 'HELD' });

      expect(storedCharges(subscription)).toHaveLength(0);
      expect(subscription.nextDueDate?.value).toBe(DUE_IN_LEAD);
      expect(h.provider.charges.size).toBe(0);
    });
  });

  it('A6: a missing renewable price skips that subscription, never a zero price and never a crash', async () => {
    h.prices.clear();
    const subscription = activeSubscription().build();
    await h.seedTenant(subscription);

    await expect(issue(subscription)).resolves.toEqual({ outcome: 'PRICE_MISSING' });

    expect(storedCharges(subscription)).toHaveLength(0);
    expect(subscription.nextDueDate?.value).toBe(DUE_IN_LEAD);
  });

  it('a tenant-local date a day behind UTC is judged on the local date', async () => {
    // 02:00Z on 2026-03-21 is still 23:00 on 2026-03-20 in São Paulo: a due date of 03-30 is
    // 10 days away locally, but 9 days away by the UTC date, so only the local date selects it.
    h.clock.setTo(new Date('2026-03-21T02:00:00Z'));
    const subscription = activeSubscription('2026-03-30').build();
    await h.seedTenant(subscription);

    await expect(issue(subscription)).resolves.toMatchObject({ outcome: 'ISSUED' });
  });

  describe('trials', () => {
    const trial = (nextDueDate: string, confirmed: boolean) =>
      new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withAnchorDay(20)
        .withNextDueDate(nextDueDate)
        .withPlanConfirmedAt(confirmed ? new Date('2026-03-01T12:00:00Z') : null)
        .withItems([h.hotsiteItem()])
        .build();

    it('a confirmed plan is invoiced from the lead day, due at the trial end', async () => {
      const subscription = trial(DUE_IN_LEAD, true);
      await h.seedTenant(subscription);

      await expect(issue(subscription)).resolves.toMatchObject({ outcome: 'ISSUED' });

      expect(storedCharges(subscription)[0].dueDate.value).toBe(DUE_IN_LEAD);
    });

    it('A10: an unconfirmed plan is invoiced only on the fallback day, from the default selection', async () => {
      const early = trial(DUE_IN_LEAD, false);
      await h.seedTenant(early);
      await expect(issue(early)).resolves.toEqual({ outcome: 'NOT_DUE' });

      h.clock.setTo(new Date('2026-03-17T15:00:00Z'));
      await expect(issue(early)).resolves.toMatchObject({ outcome: 'ISSUED' });
    });
  });
});

function activeSubscription_exempt(h: ReturnType<typeof createIssueHarness>): SubscriptionBuilder {
  return new SubscriptionBuilder()
    .withStatus('ACTIVE')
    .withExempt(true)
    .withNextDueDate('2026-03-20')
    .withItems([h.hotsiteItem()]);
}

function activeSubscription_suspended(
  h: ReturnType<typeof createIssueHarness>,
): SubscriptionBuilder {
  return new SubscriptionBuilder()
    .withSuspension('NON_PAYMENT', new Date('2026-03-01T12:00:00Z'))
    .withNextDueDate('2026-03-20')
    .withItems([h.hotsiteItem()]);
}

function activeSubscription_pastDue(h: ReturnType<typeof createIssueHarness>): SubscriptionBuilder {
  return new SubscriptionBuilder()
    .withStatus('PAST_DUE')
    .withPastDueSince(new Date('2026-03-05T12:00:00Z'))
    .withNextDueDate('2026-03-20')
    .withItems([h.hotsiteItem()]);
}
