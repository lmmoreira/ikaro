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
import {
  BillingTenantNotFoundError,
  FeatureDependencyUnmetError,
  FeatureHasDependentsError,
  NoPriceForCountryError,
  PlanEmptyError,
} from '../../domain/errors/billing-domain.error';
import type { FeatureTier } from '../../domain/feature-price.aggregate';
import type { SelectionEntry } from '../../domain/plan-selection';
import type { Subscription } from '../../domain/subscription.aggregate';
import { PreviewPlanSelectionUseCase } from './preview-plan-selection.use-case';

// 15:00 UTC is 12:00 in São Paulo: the tenant-local date is 2026-11-12.
const NOW = new Date('2026-11-12T15:00:00.000Z');
const ZONE = 'America/Sao_Paulo';
const LONG_AGO = new Date('2026-01-01T00:00:00.000Z');
const STANDARD_PRICES: Record<FeatureKey, number> = {
  HOTSITE: 4900,
  BOOKING: 3900,
  LOYALTY: 2900,
  CHATBOT: 1900,
  LEAD_FORM: 1500,
};

const entry = (featureKey: FeatureKey, tier: FeatureTier = 'STANDARD'): SelectionEntry => ({
  featureKey,
  tier,
});

function item(featureKey: FeatureKey, tier: FeatureTier = 'STANDARD') {
  return new SubscriptionItemBuilder()
    .withFeatureKey(featureKey)
    .withTier(tier)
    .withStartsAt(LONG_AGO)
    .build();
}

describe('PreviewPlanSelectionUseCase', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let charges: InMemoryChargeRepository;
  let prices: InMemoryFeaturePriceRepository;
  let useCase: PreviewPlanSelectionUseCase;

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
    useCase = new PreviewPlanSelectionUseCase(subscriptions, charges, prices, new FixedClock(NOW));
    for (const [featureKey, amount] of Object.entries(STANDARD_PRICES)) {
      if (featureKey !== 'CHATBOT') {
        seedPrice(featureKey as FeatureKey, 'STANDARD', [version(amount)]);
      }
    }
    seedPrice('CHATBOT', 'BASIC', [version(1900)]);
    seedPrice('CHATBOT', 'PLUS', [version(7900)]);
  });

  // The last paid day is 2026-11-19, so a change saved today takes effect on 2026-11-20.
  const active = () =>
    new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withTrialEndsAt(null)
      .withTimezone(ZONE)
      .withAnchorDay(20)
      .withCurrentPeriod(new Date('2026-10-20T03:00:00Z'), localDateEndUTC('2026-11-19', ZONE))
      .withItems([item('HOTSITE'), item('BOOKING'), item('CHATBOT', 'BASIC')]);

  async function preview(subscription: Subscription, items: SelectionEntry[]) {
    await subscriptions.save(subscription);
    return useCase.execute({ tenantId: subscription.tenantId, items });
  }

  describe('an ACTIVE tenant', () => {
    it('dates every change at the next period start and totals the proposed plan', async () => {
      const result = await preview(active().build(), [
        entry('HOTSITE'),
        entry('CHATBOT', 'PLUS'),
        entry('LEAD_FORM'),
      ]);

      expect(result.effectiveFrom).toBe('2026-11-20');
      expect(result.deferredBecauseNextInvoicePaid).toBe(false);
      expect(result.changes).toEqual([
        {
          featureKey: 'BOOKING',
          kind: 'REMOVE',
          fromTier: 'STANDARD',
          toTier: null,
          effectiveFrom: '2026-11-20',
        },
        {
          featureKey: 'CHATBOT',
          kind: 'TIER_CHANGE',
          fromTier: 'BASIC',
          toTier: 'PLUS',
          effectiveFrom: '2026-11-20',
        },
        {
          featureKey: 'LEAD_FORM',
          kind: 'ADD',
          fromTier: null,
          toTier: 'STANDARD',
          effectiveFrom: '2026-11-20',
        },
      ]);
      expect(result.newTotalMinor).toBe(4900 + 7900 + 1500);
    });

    it('prices on the day the change takes effect, not today: an announced increase applies', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900), version(5900, '2026-11-20')]);

      const result = await preview(
        active()
          .withItems([item('HOTSITE')])
          .build(),
        [entry('HOTSITE')],
      );

      expect(result.changes).toEqual([]);
      expect(result.newTotalMinor).toBe(5900);
    });

    it('reports no change for the plan the tenant already has', async () => {
      const result = await preview(active().build(), [
        entry('HOTSITE'),
        entry('BOOKING'),
        entry('CHATBOT', 'BASIC'),
      ]);

      expect(result.changes).toEqual([]);
      expect(result.newTotalMinor).toBe(4900 + 3900 + 1900);
    });

    it('previews a plan that is read-only (reported, not enforced): PAST_DUE still answers', async () => {
      const pastDue = active().withStatus('PAST_DUE').withPastDueSince(NOW).build();

      const result = await preview(pastDue, [entry('HOTSITE')]);

      expect(result.effectiveFrom).toBe('2026-11-20');
      expect(result.changes.map((change) => change.kind)).toEqual(['REMOVE', 'REMOVE']);
    });
  });

  describe('rejections (UC-136 A1, A5, A6)', () => {
    it('rejects a feature whose requirement is missing', async () => {
      const subscription = active()
        .withItems([item('HOTSITE')])
        .build();

      await expect(
        preview(subscription, [entry('HOTSITE'), entry('LOYALTY')]),
      ).rejects.toBeInstanceOf(FeatureDependencyUnmetError);
    });

    it('rejects removing a feature another selected feature depends on', async () => {
      const subscription = active()
        .withItems([item('HOTSITE'), item('BOOKING'), item('LOYALTY')])
        .build();

      await expect(
        preview(subscription, [entry('HOTSITE'), entry('LOYALTY')]),
      ).rejects.toBeInstanceOf(FeatureHasDependentsError);
    });

    it('rejects an empty plan', async () => {
      await expect(preview(active().build(), [])).rejects.toBeInstanceOf(PlanEmptyError);
    });

    it('rejects a newly picked tier with no price in force for the country', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900)]);

      await expect(
        preview(
          active()
            .withItems([item('HOTSITE')])
            .build(),
          [entry('HOTSITE'), entry('BOOKING')],
        ),
      ).rejects.toEqual(new NoPriceForCountryError('BOOKING', 'STANDARD'));
    });

    it('rejects a newly picked tier whose price is hidden from new selection', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900)]);
      seedPrice('CHATBOT', 'PLUS', [version(7900)], false);

      await expect(
        preview(
          active()
            .withItems([item('HOTSITE'), item('CHATBOT', 'BASIC')])
            .build(),
          [entry('HOTSITE'), entry('CHATBOT', 'PLUS')],
        ),
      ).rejects.toBeInstanceOf(NoPriceForCountryError);
    });

    it('rejects a tier whose first version starts after the day it would take effect', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900)]);
      seedPrice('LEAD_FORM', 'STANDARD', [version(1500, '2027-01-01')]);

      await expect(
        preview(
          active()
            .withItems([item('HOTSITE')])
            .build(),
          [entry('HOTSITE'), entry('LEAD_FORM')],
        ),
      ).rejects.toBeInstanceOf(NoPriceForCountryError);
    });

    it('keeps pricing a held tier whose price was hidden since: a hidden price still renews', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900)]);
      seedPrice('CHATBOT', 'BASIC', [version(1900)], false);

      const result = await preview(
        active()
          .withItems([item('HOTSITE'), item('CHATBOT', 'BASIC')])
          .build(),
        [entry('HOTSITE'), entry('CHATBOT', 'BASIC')],
      );

      expect(result.newTotalMinor).toBe(4900 + 1900);
    });

    it('rejects a held tier that has no price at all (never a partial total)', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900)]);

      await expect(
        preview(
          active()
            .withItems([item('HOTSITE'), item('BOOKING')])
            .build(),
          [entry('HOTSITE'), entry('BOOKING')],
        ),
      ).rejects.toBeInstanceOf(NoPriceForCountryError);
    });

    it('answers a tenant with no subscription row as not found', async () => {
      await expect(
        useCase.execute({ tenantId: 'no-such-tenant', items: [entry('HOTSITE')] }),
      ).rejects.toBeInstanceOf(BillingTenantNotFoundError);
    });
  });

  describe('the next invoice is already paid (UC-136 A7)', () => {
    it('moves a trial to the period after the paid first invoice and says so', async () => {
      const trial = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTimezone(ZONE)
        .withAnchorDay(20)
        .withTrialEndsAt(localDateStartUTC('2026-11-20', ZONE))
        .withItems([
          item('HOTSITE'),
          item('BOOKING'),
          item('LOYALTY'),
          item('CHATBOT', 'BASIC'),
          item('LEAD_FORM'),
        ])
        .build();
      await charges.save(
        new ChargeBuilder()
          .withTenantId(trial.tenantId)
          .withSubscriptionId(trial.id)
          .withPeriod('2026-11-20', '2026-12-19')
          .withPaid('PIX', new Date('2026-11-10T12:00:00Z'))
          .build(),
      );

      const result = await preview(trial, [entry('HOTSITE')]);

      expect(result.deferredBecauseNextInvoicePaid).toBe(true);
      expect(result.effectiveFrom).toBe('2026-12-20');
      expect(result.changes.every((change) => change.effectiveFrom === '2026-12-20')).toBe(true);
    });

    it('does not defer a trial while the first invoice is unpaid', async () => {
      const trial = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTimezone(ZONE)
        .withAnchorDay(20)
        .withTrialEndsAt(localDateStartUTC('2026-11-20', ZONE))
        .withItems([item('HOTSITE'), item('BOOKING')])
        .build();
      await charges.save(
        new ChargeBuilder()
          .withTenantId(trial.tenantId)
          .withSubscriptionId(trial.id)
          .withPeriod('2026-11-20', '2026-12-19')
          .build(),
      );

      const result = await preview(trial, [entry('HOTSITE')]);

      expect(result.deferredBecauseNextInvoicePaid).toBe(false);
      expect(result.effectiveFrom).toBe('2026-11-20');
    });

    it('says an active tenant paid ahead is deferred, with the date already past the paid period (no second shift)', async () => {
      const subscription = active()
        .withCurrentPeriod(new Date('2026-10-20T03:00:00Z'), localDateEndUTC('2026-12-19', ZONE))
        .build();
      await charges.save(
        new ChargeBuilder()
          .withTenantId(subscription.tenantId)
          .withSubscriptionId(subscription.id)
          .withPeriod('2026-11-20', '2026-12-19')
          .withPaid('PIX', new Date('2026-11-10T12:00:00Z'))
          .build(),
      );

      const result = await preview(subscription, [entry('HOTSITE')]);

      expect(result.deferredBecauseNextInvoicePaid).toBe(true);
      expect(result.effectiveFrom).toBe('2026-12-20');
    });

    it('does not defer when the next invoice is issued but still pending', async () => {
      const subscription = active().build();
      await charges.save(
        new ChargeBuilder()
          .withTenantId(subscription.tenantId)
          .withSubscriptionId(subscription.id)
          .withPeriod('2026-11-20', '2026-12-19')
          .build(),
      );

      const result = await preview(subscription, [entry('HOTSITE')]);

      expect(result.deferredBecauseNextInvoicePaid).toBe(false);
      expect(result.effectiveFrom).toBe('2026-11-20');
    });
  });

  describe('suspended and exempt (UC-136 A14, UC-117 A7)', () => {
    it('gives no date while suspended for payment and totals the one-month recovery charge at today’s prices', async () => {
      prices.clear();
      seedPrice('HOTSITE', 'STANDARD', [version(4900), version(5900, '2026-11-20')]);
      seedPrice('BOOKING', 'STANDARD', [version(3900)]);
      const suspended = new SubscriptionBuilder()
        .withStatus('SUSPENDED')
        .withSuspension('NON_PAYMENT', new Date('2026-11-01T12:00:00Z'))
        .withTimezone(ZONE)
        .withItems([item('HOTSITE'), item('BOOKING'), item('CHATBOT', 'BASIC')])
        .build();

      const result = await preview(suspended, [entry('HOTSITE'), entry('BOOKING')]);

      expect(result.effectiveFrom).toBeNull();
      expect(result.deferredBecauseNextInvoicePaid).toBe(false);
      expect(result.changes).toEqual([
        {
          featureKey: 'CHATBOT',
          kind: 'REMOVE',
          fromTier: 'BASIC',
          toTier: null,
          effectiveFrom: null,
        },
      ]);
      expect(result.newTotalMinor).toBe(4900 + 3900);
    });

    it('does not look at charges while suspended', async () => {
      const lookup = jest.spyOn(charges, 'findFirstPeriodCharge');
      const suspended = new SubscriptionBuilder()
        .withStatus('SUSPENDED')
        .withSuspension('CANCELED', new Date('2026-11-01T12:00:00Z'))
        .withItems([item('HOTSITE')])
        .build();

      await preview(suspended, [entry('HOTSITE')]);

      expect(lookup).not.toHaveBeenCalled();
    });

    it('gives an exempt subscription no date and a zero total, without reading any price', async () => {
      prices.clear();
      const exempt = active().withExempt(true).build();

      const result = await preview(exempt, [entry('HOTSITE')]);

      expect(result.effectiveFrom).toBeNull();
      expect(result.newTotalMinor).toBe(0);
    });
  });

  describe('a preview saves nothing and decides nothing for the removal guard', () => {
    it('writes no subscription, no charge and no event, even for a BOOKING removal', async () => {
      const subscription = active().build();
      await subscriptions.save(subscription);
      const saveSubscription = jest.spyOn(subscriptions, 'save');
      const saveCharge = jest.spyOn(charges, 'save');
      const itemsBefore = JSON.stringify(subscription.items);

      await useCase.execute({
        tenantId: subscription.tenantId,
        items: [entry('HOTSITE'), entry('CHATBOT', 'BASIC')],
      });

      expect(saveSubscription).not.toHaveBeenCalled();
      expect(saveCharge).not.toHaveBeenCalled();
      expect(JSON.stringify(subscription.items)).toBe(itemsBefore);
      expect(subscription.itemsDirty).toBe(false);
    });
  });

  describe('tenant isolation', () => {
    it('previews only the caller’s own plan, never another tenant’s', async () => {
      const mine = active()
        .withItems([item('HOTSITE')])
        .build();
      const theirs = active()
        .withItems([item('HOTSITE'), item('BOOKING')])
        .build();
      await subscriptions.save(mine);
      await subscriptions.save(theirs);

      const result = await useCase.execute({
        tenantId: mine.tenantId,
        items: [entry('HOTSITE'), entry('BOOKING')],
      });

      expect(result.changes.map((change) => [change.featureKey, change.kind])).toEqual([
        ['BOOKING', 'ADD'],
      ]);
    });
  });
});
