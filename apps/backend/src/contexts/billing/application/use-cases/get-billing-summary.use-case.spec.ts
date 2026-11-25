import type { FeatureKey } from '@ikaro/validation';
import {
  BillingAccountBuilder,
  ChargeBuilder,
  FeaturePriceBuilder,
  FeaturePriceVersionBuilder,
  SubscriptionBuilder,
  SubscriptionItemBuilder,
} from '../../../../test/builders/billing';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { InMemoryBillingAccountRepository } from '../../../../test/repositories/billing/in-memory-billing-account.repository';
import { InMemoryChargeRepository } from '../../../../test/repositories/billing/in-memory-charge.repository';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { testAddress } from '../../../../test/utils/address-helpers';
import { AppLogger } from '../../../../shared/observability/app-logger';
import type { FeatureTier } from '../../domain/feature-price.aggregate';
import type { Subscription } from '../../domain/subscription.aggregate';
import { GetBillingSummaryUseCase } from './get-billing-summary.use-case';

// 15:00 UTC is 12:00 in São Paulo: the tenant-local date is 2026-11-12.
const NOW = new Date('2026-11-12T15:00:00.000Z');
const LONG_AGO = new Date('2026-01-01T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function item(featureKey: FeatureKey, tier: FeatureTier = 'STANDARD') {
  return new SubscriptionItemBuilder()
    .withFeatureKey(featureKey)
    .withTier(tier)
    .withStartsAt(LONG_AGO)
    .build();
}

describe('GetBillingSummaryUseCase', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let accounts: InMemoryBillingAccountRepository;
  let charges: InMemoryChargeRepository;
  let prices: InMemoryFeaturePriceRepository;
  let useCase: GetBillingSummaryUseCase;

  const seedPrice = (
    featureKey: FeatureKey,
    tier: FeatureTier,
    versions: FeaturePriceVersionBuilder[],
  ) =>
    prices.seed(
      new FeaturePriceBuilder()
        .withFeatureKey(featureKey)
        .withTier(tier)
        .withVersions(versions.map((version) => version.build()))
        .build(),
    );
  const version = (amountMinor: number, effectiveFrom: string) =>
    new FeaturePriceVersionBuilder().withAmountMinor(amountMinor).withEffectiveFrom(effectiveFrom);

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    accounts = new InMemoryBillingAccountRepository();
    charges = new InMemoryChargeRepository();
    prices = new InMemoryFeaturePriceRepository();
    useCase = new GetBillingSummaryUseCase(
      subscriptions,
      accounts,
      charges,
      prices,
      new FixedClock(NOW),
    );
    seedPrice('HOTSITE', 'STANDARD', [version(4900, '2026-01-01')]);
    seedPrice('CHATBOT', 'PLUS', [version(7900, '2026-01-01')]);
  });

  async function readyOf(subscription: Subscription) {
    await subscriptions.save(subscription);
    const result = await useCase.execute({ tenantId: subscription.tenantId });
    if (result.provisioning) throw new Error('expected a full summary');
    return result;
  }

  const activeSubscription = () =>
    new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withTrialEndsAt(null)
      .withNextDueDate('2026-11-20')
      .withItems([item('HOTSITE'), item('CHATBOT', 'PLUS')]);

  describe('a tenant without a subscription', () => {
    it('answers provisioning instead of throwing (UC-117 A9)', async () => {
      await expect(useCase.execute({ tenantId: 'no-such-tenant' })).resolves.toEqual({
        provisioning: true,
      });
    });
  });

  describe('freshness', () => {
    it('reads the committed row, never the cached copy', async () => {
      const subscription = activeSubscription().build();
      await subscriptions.save(subscription);
      const cached = jest.spyOn(subscriptions, 'findByTenantId');
      const fresh = jest.spyOn(subscriptions, 'findFreshByTenantId');

      await useCase.execute({ tenantId: subscription.tenantId });

      expect(fresh).toHaveBeenCalledWith(subscription.tenantId);
      expect(cached).not.toHaveBeenCalled();
    });
  });

  describe('an ACTIVE tenant', () => {
    it('lists the items at the version in force today and sums them; a future version is only an upcoming change', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900, '2026-01-01')]);
      prices.seed(
        new FeaturePriceBuilder()
          .withFeatureKey('CHATBOT')
          .withTier('PLUS')
          .withVersions([
            version(7900, '2026-01-01').build(),
            version(8900, '2026-12-10').withAnnouncedAt(new Date('2026-11-01T00:00:00Z')).build(),
          ])
          .build(),
      );

      const summary = await readyOf(activeSubscription().build());

      expect(summary.items).toEqual([
        { featureKey: 'HOTSITE', tier: 'STANDARD', unitPriceMinor: 4900 },
        { featureKey: 'CHATBOT', tier: 'PLUS', unitPriceMinor: 7900 },
      ]);
      expect(summary.totalMinor).toBe(12800);
      expect(summary.upcomingPriceChanges).toEqual([
        {
          featureKey: 'CHATBOT',
          tier: 'PLUS',
          currentAmountMinor: 7900,
          newAmountMinor: 8900,
          effectiveFrom: '2026-12-10',
        },
      ]);
    });

    it('never shows a version whose fan-out has not run or that a newer one superseded', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [
        version(4900, '2026-01-01'),
        version(5100, '2026-12-01'), // announcedAt null: created, not announced
        version(5200, '2026-12-15')
          .withAnnouncedAt(new Date('2026-11-01T00:00:00Z'))
          .withSupersededAt(new Date('2026-11-02T00:00:00Z')),
      ]);
      seedPrice('CHATBOT', 'PLUS', [version(7900, '2026-01-01')]);

      const summary = await readyOf(activeSubscription().build());

      expect(summary.upcomingPriceChanges).toEqual([]);
    });

    it('carries the summary facts of a plain active subscription', async () => {
      const subscription = activeSubscription().build();

      const summary = await readyOf(subscription);

      expect(summary).toMatchObject({
        provisioning: false,
        status: 'ACTIVE',
        exempt: false,
        suspensionReason: null,
        currency: 'BRL',
        countryCode: 'BR',
        timezone: 'America/Sao_Paulo',
        cycle: 'MONTHLY',
        nextCycle: null,
        nextCycleFrom: null,
        nextDueDate: '2026-11-20',
        suspendsAt: null,
        purgeAt: null,
        planConfirmationRequired: false,
        planConfirmationFallbackAt: null,
        canDiscard: false,
        autoBilling: { mode: 'NONE', status: 'INACTIVE', label: null },
        paymentConfirmationPending: false,
        openCharge: null,
      });
    });
  });

  describe('the plan confirmation of a trial', () => {
    it('is required until confirmed and falls back 3 days before the first due date', async () => {
      const trialEndsAt = new Date('2026-11-22T03:00:00.000Z');
      const unconfirmed = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(trialEndsAt)
        .withNextDueDate('2026-11-22')
        .withItems([item('HOTSITE')])
        .build();
      const confirmed = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(trialEndsAt)
        .withNextDueDate('2026-11-22')
        .withPlanConfirmedAt(NOW)
        .withItems([item('HOTSITE')])
        .build();

      const pending = await readyOf(unconfirmed);
      const done = await readyOf(confirmed);

      expect(pending).toMatchObject({
        planConfirmationRequired: true,
        planConfirmationFallbackAt: '2026-11-19',
      });
      expect(done).toMatchObject({
        planConfirmationRequired: false,
        planConfirmationFallbackAt: null,
      });
    });

    it('prices the plan invoiced first at the version in force on that period’s start, not today', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900, '2026-01-01'), version(5900, '2026-11-20')]);
      const trial = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(new Date('2026-11-22T03:00:00.000Z'))
        .withNextDueDate('2026-11-22')
        .withItems([item('HOTSITE')])
        .build();

      const summary = await readyOf(trial);

      expect(summary.items).toEqual([
        { featureKey: 'HOTSITE', tier: 'STANDARD', unitPriceMinor: 5900 },
      ]);
      expect(summary.totalMinor).toBe(5900);
    });
  });

  describe('suspendsAt and purgeAt reuse the aggregate', () => {
    it.each([
      ['no grace_until: past_due_since + 14 days', null, '2026-11-24T00:00:00.000Z'],
      ['an operator grace_until', '2026-12-31T00:00:00.000Z', '2026-12-31T00:00:00.000Z'],
    ])('PAST_DUE with %s', async (_label, graceUntil, expected) => {
      const subscription = activeSubscription()
        .withStatus('PAST_DUE')
        .withPastDueSince(new Date('2026-11-10T00:00:00.000Z'))
        .withGraceUntil(graceUntil === null ? null : new Date(graceUntil))
        .build();

      const summary = await readyOf(subscription);

      expect(summary.suspendsAt).toBe(expected);
      expect(summary.suspendsAt).toBe(subscription.suspendsAt?.toISOString());
    });

    it.each([
      ['never paid', false, 90],
      ['paid at least once', true, 180],
    ])('SUSPENDED, %s: purgeAt is suspended_at + %i days', async (_label, hasEverPaid, days) => {
      const suspendedAt = new Date('2026-11-01T00:00:00.000Z');
      const subscription = activeSubscription()
        .withSuspension('NON_PAYMENT', suspendedAt)
        .withHasEverPaid(hasEverPaid)
        .build();

      const summary = await readyOf(subscription);

      expect(summary.purgeAt).toBe(new Date(suspendedAt.getTime() + days * DAY_MS).toISOString());
      expect(summary.suspensionReason).toBe('NON_PAYMENT');
    });
  });

  describe('the open charge', () => {
    it('returns the oldest open period charge, never a URL, and ignores another tenant’s', async () => {
      const subscription = activeSubscription().build();
      const other = activeSubscription().build();
      await subscriptions.save(other);
      const open = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .withDueDate('2026-11-20')
        .withProviderReady('ASAAS', 'pay_1')
        .build();
      await charges.save(open);
      await charges.save(
        new ChargeBuilder()
          .withTenantId(other.tenantId)
          .withSubscriptionId(other.id)
          .withDueDate('2026-11-01')
          .build(),
      );

      const summary = await readyOf(subscription);

      expect(summary.openCharge).toMatchObject({
        id: open.id,
        kind: 'PERIOD',
        dueDate: '2026-11-20',
        taxMinor: 0,
        status: 'PENDING',
        hasPaymentLink: true,
      });
      expect(JSON.stringify(summary)).not.toContain('https://');
    });

    it('returns the open RECOVERY charge, not the stale period charge, while suspended', async () => {
      const subscription = activeSubscription()
        .withSuspension('NON_PAYMENT', new Date('2026-11-01T00:00:00.000Z'))
        .build();
      await charges.save(
        new ChargeBuilder()
          .withTenantId(subscription.tenantId)
          .withSubscriptionId(subscription.id)
          .withStatus('OVERDUE')
          .withDueDate('2026-10-20')
          .build(),
      );
      const recovery = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .asRecovery()
        .withDueDate('2026-11-08')
        .build();
      await charges.save(recovery);

      const summary = await readyOf(subscription);

      expect(summary.openCharge).toMatchObject({ id: recovery.id, kind: 'RECOVERY' });
    });

    it('shows the plan that paying reactivates while suspended, priced today', async () => {
      const subscription = activeSubscription()
        .withSuspension('NON_PAYMENT', new Date('2026-11-01T00:00:00.000Z'))
        .build();

      const summary = await readyOf(subscription);

      expect(summary.items.map((entry) => entry.featureKey)).toEqual(['HOTSITE', 'CHATBOT']);
      expect(summary.totalMinor).toBe(12800);
      expect(summary.openCharge).toBeNull();
    });

    it('ignores an open charge issued before an exemption was set and cleared, and returns the new trial’s own', async () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(new Date('2026-11-22T03:00:00.000Z'))
        .withNextDueDate('2026-11-22')
        .withItems([item('HOTSITE')])
        .build();
      const stale = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .withPeriod('2026-06-22', '2026-07-21')
        .withDueDate('2026-06-22')
        .withStatus('OVERDUE')
        .build();
      await charges.save(stale);

      expect((await readyOf(subscription)).openCharge).toBeNull();

      const current = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .withPeriod('2026-11-22', '2026-12-21')
        .withDueDate('2026-11-22')
        .build();
      await charges.save(current);

      expect((await readyOf(subscription)).openCharge?.id).toBe(current.id);
    });

    it('flags a payment the manager returned from while the charge is still open', async () => {
      const subscription = activeSubscription().build();
      await charges.save(
        new ChargeBuilder()
          .withTenantId(subscription.tenantId)
          .withSubscriptionId(subscription.id)
          .withPaymentReturnSeenAt(new Date('2026-11-12T14:00:00.000Z'))
          .build(),
      );

      const summary = await readyOf(subscription);

      expect(summary.paymentConfirmationPending).toBe(true);
    });

    describe('hasPaymentLink', () => {
      const chargeFor = (subscription: Subscription, build: (b: ChargeBuilder) => ChargeBuilder) =>
        build(
          new ChargeBuilder()
            .withTenantId(subscription.tenantId)
            .withSubscriptionId(subscription.id),
        ).build();

      // The clock is frozen at NOW, so the expiry is placed around it.
      it.each([
        ['1 ms before the expiry', 1, true],
        ['at the expiry instant', 0, false],
        ['1 ms after the expiry', -1, false],
      ])('is decided by the backend clock: %s', async (_label, msUntilExpiry, expected) => {
        const subscription = activeSubscription().build();
        await charges.save(
          chargeFor(subscription, (b) =>
            b
              .withProviderReady('ASAAS', 'pay_2')
              .withPaymentUrlExpiresAt(new Date(NOW.getTime() + msUntilExpiry)),
          ),
        );

        const summary = await readyOf(subscription);

        expect(summary.openCharge?.hasPaymentLink).toBe(expected);
        expect(summary.openCharge?.paymentLinkExpiresAt).toBe(
          new Date(NOW.getTime() + msUntilExpiry).toISOString(),
        );
      });

      it('is true with no expiry and false with no link at all', async () => {
        const withLink = activeSubscription().build();
        const withoutLink = activeSubscription().build();
        await charges.save(chargeFor(withLink, (b) => b.withProviderReady('ASAAS', 'pay_3')));
        await charges.save(chargeFor(withoutLink, (b) => b));

        const a = await readyOf(withLink);
        const b = await readyOf(withoutLink);

        expect(a.openCharge).toMatchObject({ hasPaymentLink: true, paymentLinkExpiresAt: null });
        expect(b.openCharge?.hasPaymentLink).toBe(false);
      });
    });
  });

  describe('firstChargePaid', () => {
    const trialSubscription = () =>
      new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(new Date('2026-11-22T03:00:00.000Z'))
        .withNextDueDate('2026-11-22')
        .withItems([item('HOTSITE')]);
    const firstCharge = (subscription: Subscription) =>
      new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .withPeriod('2026-11-22', '2026-12-21')
        .withDueDate('2026-11-22');

    it('is false for a trial with no charge', async () => {
      expect((await readyOf(trialSubscription().build())).firstChargePaid).toBe(false);
    });

    it.each([['PENDING'], ['REFUNDED'], ['CHARGEBACK']] as const)(
      'is false while the first charge is %s',
      async (status) => {
        const subscription = trialSubscription().build();
        await charges.save(firstCharge(subscription).withStatus(status).build());

        expect((await readyOf(subscription)).firstChargePaid).toBe(false);
      },
    );

    it('is true once the first PERIOD charge is PAID, and stays true after a later cancel', async () => {
      const subscription = trialSubscription()
        .withCancelAt(new Date('2026-12-30T03:00:00.000Z'))
        .build();
      await charges.save(firstCharge(subscription).withPaid('PIX', NOW).build());

      expect((await readyOf(subscription)).firstChargePaid).toBe(true);
    });

    it('is false for a re-trial after an exemption whose own first charge is unpaid, even though has_ever_paid is true', async () => {
      const subscription = trialSubscription().withHasEverPaid(true).build();
      // The older trial's paid charge starts before this trial's first invoice.
      await charges.save(
        firstCharge(subscription)
          .withPeriod('2026-06-22', '2026-07-21')
          .withDueDate('2026-06-22')
          .withPaid('PIX', new Date('2026-06-20T00:00:00.000Z'))
          .build(),
      );
      await charges.save(firstCharge(subscription).withStatus('PENDING').build());

      const summary = await readyOf(subscription);

      expect(subscription.hasEverPaid).toBe(true);
      expect(summary.firstChargePaid).toBe(false);
    });
  });

  describe('addressRequired', () => {
    it('is true until the full billing address is saved, then false', async () => {
      const subscription = activeSubscription().build();
      await accounts.save(
        new BillingAccountBuilder().withTenantId(subscription.tenantId).withAddress(null).build(),
      );
      expect((await readyOf(subscription)).addressRequired).toBe(true);

      const saved = activeSubscription().build();
      await accounts.save(
        new BillingAccountBuilder().withTenantId(saved.tenantId).withAddress(testAddress()).build(),
      );
      expect((await readyOf(saved)).addressRequired).toBe(false);
    });

    it('is true for a tenant with no billing account row', async () => {
      expect((await readyOf(activeSubscription().build())).addressRequired).toBe(true);
    });
  });

  describe('an exempt tenant', () => {
    it('gets no items, no total, no open charge, no price changes and no address demand', async () => {
      const subscription = activeSubscription().withExempt(true).build();
      await charges.save(
        new ChargeBuilder()
          .withTenantId(subscription.tenantId)
          .withSubscriptionId(subscription.id)
          .build(),
      );

      const summary = await readyOf(subscription);

      expect(summary).toMatchObject({
        exempt: true,
        items: [],
        totalMinor: 0,
        openCharge: null,
        upcomingPriceChanges: [],
        addressRequired: false,
        firstChargePaid: false,
        planConfirmationRequired: false,
      });
    });
  });

  describe('a missing price', () => {
    it('degrades the item and the total to null, logs an error with the tenant, and still returns the open charge', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900, '2026-01-01')]);
      const logged = jest.spyOn(AppLogger.prototype, 'error').mockImplementation(() => undefined);
      const subscription = activeSubscription().build();
      const open = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .build();
      await charges.save(open);

      const summary = await readyOf(subscription);

      expect(summary.items).toEqual([
        { featureKey: 'HOTSITE', tier: 'STANDARD', unitPriceMinor: 4900 },
        { featureKey: 'CHATBOT', tier: 'PLUS', unitPriceMinor: null },
      ]);
      expect(summary.totalMinor).toBeNull();
      expect(summary.openCharge?.id).toBe(open.id);
      expect(logged).toHaveBeenCalledWith(expect.stringContaining(subscription.tenantId));
      logged.mockRestore();
    });
  });
});
