import type { BillingPlanReadyResponse } from '@ikaro/types';
import type { FeatureKey } from '@ikaro/validation';
import { localDateEndUTC, localDateStartUTC } from '../../../../shared/utils/calendar-date';
import {
  ChargeBuilder,
  FeaturePriceBuilder,
  FeaturePriceVersionBuilder,
  SubscriptionBuilder,
  SubscriptionItemBuilder,
} from '../../../../test/builders/billing';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { InMemoryChargeRepository } from '../../../../test/repositories/billing/in-memory-charge.repository';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import type { FeatureTier } from '../../domain/feature-price.aggregate';
import type { Subscription } from '../../domain/subscription.aggregate';
import { GetPlanCatalogUseCase } from './get-plan-catalog.use-case';

// 15:00 UTC is 12:00 in São Paulo: the tenant-local date is 2026-11-12.
const NOW = new Date('2026-11-12T15:00:00.000Z');
const ZONE = 'America/Sao_Paulo';
const LONG_AGO = new Date('2026-01-01T00:00:00.000Z');
const ANNOUNCED = new Date('2026-10-01T00:00:00.000Z');

function item(featureKey: FeatureKey, tier: FeatureTier = 'STANDARD') {
  return new SubscriptionItemBuilder()
    .withFeatureKey(featureKey)
    .withTier(tier)
    .withStartsAt(LONG_AGO)
    .build();
}

describe('GetPlanCatalogUseCase', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let charges: InMemoryChargeRepository;
  let prices: InMemoryFeaturePriceRepository;
  let useCase: GetPlanCatalogUseCase;

  const seedPrice = (
    featureKey: FeatureKey,
    tier: FeatureTier,
    versions: FeaturePriceVersionBuilder[],
    selectable = true,
  ) =>
    prices.seed(
      new FeaturePriceBuilder()
        .withFeatureKey(featureKey)
        .withTier(tier)
        .withSelectable(selectable)
        .withVersions(versions.map((version) => version.build()))
        .build(),
    );
  const version = (amountMinor: number, effectiveFrom = '2026-01-01') =>
    new FeaturePriceVersionBuilder().withAmountMinor(amountMinor).withEffectiveFrom(effectiveFrom);

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    charges = new InMemoryChargeRepository();
    prices = new InMemoryFeaturePriceRepository();
    useCase = new GetPlanCatalogUseCase(subscriptions, charges, prices, new FixedClock(NOW));
    seedPrice('HOTSITE', 'STANDARD', [version(4900)]);
    seedPrice('BOOKING', 'STANDARD', [version(3900)]);
    seedPrice('LOYALTY', 'STANDARD', [version(2900)]);
    seedPrice('CHATBOT', 'BASIC', [version(1900)]);
    seedPrice('CHATBOT', 'PLUS', [version(7900)]);
  });

  const active = () =>
    new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withTrialEndsAt(null)
      .withTimezone(ZONE)
      .withAnchorDay(20)
      .withCurrentPeriod(new Date('2026-10-20T03:00:00Z'), localDateEndUTC('2026-11-19', ZONE))
      .withItems([item('HOTSITE'), item('BOOKING'), item('CHATBOT', 'BASIC')]);

  async function readyOf(subscription: Subscription): Promise<BillingPlanReadyResponse> {
    await subscriptions.save(subscription);
    const result = await useCase.execute({ tenantId: subscription.tenantId });
    if (result.provisioning) throw new Error('expected a full plan');
    return result;
  }

  it('answers provisioning for a tenant with no subscription row, as the summary does', async () => {
    await expect(useCase.execute({ tenantId: 'no-such-tenant' })).resolves.toEqual({
      provisioning: true,
    });
  });

  it('reads the committed row, never the cached copy', async () => {
    const subscription = active().build();
    await subscriptions.save(subscription);
    const cached = jest.spyOn(subscriptions, 'findByTenantId');
    const fresh = jest.spyOn(subscriptions, 'findFreshByTenantId');

    await useCase.execute({ tenantId: subscription.tenantId });

    expect(fresh).toHaveBeenCalledWith(subscription.tenantId);
    expect(cached).not.toHaveBeenCalled();
  });

  describe('the catalog', () => {
    it('lists every feature with its requirements and each tier it is sold in', async () => {
      const plan = await readyOf(active().build());

      expect(plan.countryCode).toBe('BR');
      expect(plan.currency).toBe('BRL');
      expect(plan.features.map((feature) => [feature.featureKey, feature.requires])).toEqual([
        ['HOTSITE', []],
        ['BOOKING', ['HOTSITE']],
        ['LOYALTY', ['BOOKING']],
        ['CHATBOT', ['HOTSITE']],
        ['LEAD_FORM', ['HOTSITE']],
      ]);
      const chatbot = plan.features.find((feature) => feature.featureKey === 'CHATBOT');
      expect(chatbot?.tiers).toEqual([
        { tier: 'BASIC', unitPriceMinor: 1900, available: true },
        { tier: 'PLUS', unitPriceMinor: 7900, available: true },
      ]);
    });

    it('shows a tier with no selectable price as unavailable, never at zero (UC-136 A6)', async () => {
      const plan = await readyOf(active().build());

      const leadForm = plan.features.find((feature) => feature.featureKey === 'LEAD_FORM');
      expect(leadForm?.tiers).toEqual([
        { tier: 'STANDARD', unitPriceMinor: null, available: false },
      ]);
    });

    it('shows a price hidden from new selection as unavailable', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900)], false);

      const plan = await readyOf(active().build());

      expect(plan.features[0].tiers).toEqual([
        { tier: 'STANDARD', unitPriceMinor: null, available: false },
      ]);
    });

    it('carries an announced next price per tier, and only an announced, non-superseded one', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [
        version(4900),
        version(5900, '2026-12-01').withAnnouncedAt(ANNOUNCED),
      ]);
      seedPrice('BOOKING', 'STANDARD', [version(3900), version(4900, '2026-12-01')]);
      seedPrice('LOYALTY', 'STANDARD', [
        version(2900),
        version(3900, '2026-12-01')
          .withAnnouncedAt(ANNOUNCED)
          .withSupersededAt(new Date('2026-10-15T00:00:00Z')),
      ]);

      const plan = await readyOf(active().build());

      const tier = (featureKey: FeatureKey) =>
        plan.features.find((feature) => feature.featureKey === featureKey)?.tiers[0];
      expect(tier('HOTSITE')?.upcoming).toEqual({ amountMinor: 5900, effectiveFrom: '2026-12-01' });
      expect(tier('BOOKING')).not.toHaveProperty('upcoming');
      expect(tier('LOYALTY')).not.toHaveProperty('upcoming');
    });
  });

  describe('read-only states (reported, not enforced)', () => {
    it('is editable (null) for an ACTIVE tenant', async () => {
      expect((await readyOf(active().build())).readOnly).toBeNull();
    });

    it.each([
      ['PAST_DUE', active().withStatus('PAST_DUE').withPastDueSince(NOW)],
      ['EXEMPT', active().withExempt(true)],
      ['CANCEL_SCHEDULED', active().withCancelAt(new Date('2026-12-20T03:00:00Z'))],
      [
        'OPERATOR_SUSPENDED',
        new SubscriptionBuilder()
          .withStatus('SUSPENDED')
          .withSuspension('OPERATOR', new Date('2026-11-01T12:00:00Z'))
          .withItems([item('HOTSITE')]),
      ],
    ])('reports %s', async (reason, builder) => {
      expect((await readyOf(builder.build())).readOnly).toEqual({ reason });
    });

    it('is editable while suspended for payment, so the plan can be chosen before paying (A14)', async () => {
      const suspended = new SubscriptionBuilder()
        .withStatus('SUSPENDED')
        .withSuspension('NON_PAYMENT', new Date('2026-11-01T12:00:00Z'))
        .withTimezone(ZONE)
        .withItems([item('HOTSITE'), item('BOOKING')])
        .build();

      const plan = await readyOf(suspended);

      expect(plan.readOnly).toBeNull();
      expect(plan.current).toEqual([
        { featureKey: 'HOTSITE', tier: 'STANDARD', endsAt: null },
        { featureKey: 'BOOKING', tier: 'STANDARD', endsAt: null },
      ]);
      expect(plan.scheduled).toBeNull();
      expect(plan.totalMinor).toBe(4900 + 3900);
    });
  });

  describe('the plan now and what is queued', () => {
    it('lists the active items with no end and nothing scheduled for a steady plan', async () => {
      const plan = await readyOf(active().build());

      expect(plan.current).toEqual([
        { featureKey: 'HOTSITE', tier: 'STANDARD', endsAt: null },
        { featureKey: 'BOOKING', tier: 'STANDARD', endsAt: null },
        { featureKey: 'CHATBOT', tier: 'BASIC', endsAt: null },
      ]);
      expect(plan.scheduled).toBeNull();
    });

    it('shows a pending removal and a pending tier change, each with the day it starts', async () => {
      const change = localDateStartUTC('2026-11-20', ZONE);
      const subscription = active()
        .withItems([
          item('HOTSITE'),
          new SubscriptionItemBuilder()
            .withFeatureKey('BOOKING')
            .withStartsAt(LONG_AGO)
            .withEndsAt(change)
            .build(),
          new SubscriptionItemBuilder()
            .withFeatureKey('CHATBOT')
            .withTier('BASIC')
            .withStartsAt(LONG_AGO)
            .withEndsAt(change)
            .build(),
          new SubscriptionItemBuilder()
            .withFeatureKey('CHATBOT')
            .withTier('PLUS')
            .withStartsAt(change)
            .build(),
          new SubscriptionItemBuilder().withFeatureKey('LEAD_FORM').withStartsAt(change).build(),
        ])
        .build();

      const plan = await readyOf(subscription);

      expect(plan.current).toEqual([
        { featureKey: 'HOTSITE', tier: 'STANDARD', endsAt: null },
        { featureKey: 'BOOKING', tier: 'STANDARD', endsAt: '2026-11-20' },
        { featureKey: 'CHATBOT', tier: 'BASIC', endsAt: '2026-11-20' },
      ]);
      expect(plan.scheduled).toEqual([
        { featureKey: 'BOOKING', tier: null, startsAt: '2026-11-20' },
        { featureKey: 'CHATBOT', tier: 'PLUS', startsAt: '2026-11-20' },
        { featureKey: 'LEAD_FORM', tier: 'STANDARD', startsAt: '2026-11-20' },
      ]);
    });

    it('reports a trial as fully entitled, with the first paid selection queued on the trial’s end day', async () => {
      const trial = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTimezone(ZONE)
        .withTrialEndsAt(localDateStartUTC('2026-11-20', ZONE))
        .withItems([item('HOTSITE'), item('BOOKING'), item('CHATBOT', 'PLUS')])
        .build();

      const plan = await readyOf(trial);

      expect(plan.trial).toEqual({ active: true, planConfirmed: false });
      expect(plan.current.map((entry) => entry.featureKey)).toEqual([
        'HOTSITE',
        'BOOKING',
        'LOYALTY',
        'CHATBOT',
        'LEAD_FORM',
      ]);
      expect(plan.scheduled).toEqual([
        { featureKey: 'LOYALTY', tier: null, startsAt: '2026-11-20' },
        { featureKey: 'CHATBOT', tier: 'PLUS', startsAt: '2026-11-20' },
        { featureKey: 'LEAD_FORM', tier: null, startsAt: '2026-11-20' },
      ]);
    });

    it('queues nothing for a trial whose selection is still the default', async () => {
      const trial = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTimezone(ZONE)
        .withTrialEndsAt(localDateStartUTC('2026-11-20', ZONE))
        .withPlanConfirmedAt(new Date('2026-11-05T12:00:00Z'))
        .withItems([
          item('HOTSITE'),
          item('BOOKING'),
          item('LOYALTY'),
          item('CHATBOT', 'BASIC'),
          item('LEAD_FORM'),
        ])
        .build();

      const plan = await readyOf(trial);

      expect(plan.trial).toEqual({ active: true, planConfirmed: true });
      expect(plan.scheduled).toBeNull();
    });
  });

  describe('the total', () => {
    it('sums the going-forward plan priced where it takes effect, equal to a no-op preview', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900), version(5900, '2026-11-20')]);
      seedPrice('BOOKING', 'STANDARD', [version(3900)]);
      seedPrice('CHATBOT', 'BASIC', [version(1900)]);

      const plan = await readyOf(active().build());

      expect(plan.totalMinor).toBe(5900 + 3900 + 1900);
    });

    it('is the going-forward plan, so a scheduled removal is already out of it', async () => {
      const change = localDateStartUTC('2026-11-20', ZONE);
      const subscription = active()
        .withItems([
          item('HOTSITE'),
          new SubscriptionItemBuilder()
            .withFeatureKey('BOOKING')
            .withStartsAt(LONG_AGO)
            .withEndsAt(change)
            .build(),
        ])
        .build();

      expect((await readyOf(subscription)).totalMinor).toBe(4900);
    });

    it('prices from the period after a paid next invoice', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900), version(5900, '2026-12-01')]);
      const subscription = active()
        .withCurrentPeriod(new Date('2026-10-20T03:00:00Z'), localDateEndUTC('2026-12-19', ZONE))
        .withItems([item('HOTSITE')])
        .build();
      await charges.save(
        new ChargeBuilder()
          .withTenantId(subscription.tenantId)
          .withSubscriptionId(subscription.id)
          .withPeriod('2026-11-20', '2026-12-19')
          .withPaid('PIX', new Date('2026-11-10T12:00:00Z'))
          .build(),
      );

      expect((await readyOf(subscription)).totalMinor).toBe(5900);
    });

    it('is null, never a partial sum, when a held item has no price in force', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900)]);

      expect((await readyOf(active().build())).totalMinor).toBeNull();
    });

    it('is zero for an exempt subscription', async () => {
      expect((await readyOf(active().withExempt(true).build())).totalMinor).toBe(0);
    });
  });

  describe('tenant isolation', () => {
    it('returns only the caller’s own current items and total, never another tenant’s', async () => {
      const mine = active()
        .withItems([item('HOTSITE')])
        .build();
      const theirs = active()
        .withItems([item('HOTSITE'), item('BOOKING'), item('CHATBOT', 'PLUS')])
        .build();
      await subscriptions.save(mine);
      await subscriptions.save(theirs);

      const plan = await useCase.execute({ tenantId: mine.tenantId });

      if (plan.provisioning) throw new Error('expected a full plan');
      expect(plan.current.map((entry) => entry.featureKey)).toEqual(['HOTSITE']);
      expect(plan.totalMinor).toBe(4900);
    });
  });
});
