import {
  ChargeBuilder,
  FeaturePriceBuilder,
  FeaturePriceVersionBuilder,
  SubscriptionBuilder,
  SubscriptionItemBuilder,
} from '../../../../test/builders/billing';
import { InMemoryChargeRepository } from '../../../../test/repositories/billing/in-memory-charge.repository';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { FeaturePriceNotFoundError } from '../../domain/errors/billing-domain.error';
import type { Subscription } from '../../domain/subscription.aggregate';
import { type RecoveryPriceCache, RecoveryChargePlanner } from './recovery-charge-planner.service';

// 15:00Z on 2026-03-10 is 12:00 in São Paulo (UTC-3) and already 04:00 on 2026-03-11 in Auckland.
const NOW = new Date('2026-03-10T15:00:00Z');

describe('RecoveryChargePlanner', () => {
  let charges: InMemoryChargeRepository;
  let prices: InMemoryFeaturePriceRepository;
  let planner: RecoveryChargePlanner;

  beforeEach(() => {
    charges = new InMemoryChargeRepository();
    prices = new InMemoryFeaturePriceRepository();
    planner = new RecoveryChargePlanner(charges, prices);
  });

  // HOTSITE STANDARD: R$ 49,00 from the start of the year and R$ 59,00 from 2026-03-11, so a lookup
  // on one side of that day returns a different amount from the other side.
  const seedPrices = (): void =>
    prices.seed(
      new FeaturePriceBuilder()
        .withVersions([
          new FeaturePriceVersionBuilder()
            .withAmountMinor(4900)
            .withEffectiveFrom('2026-01-01')
            .build(),
          new FeaturePriceVersionBuilder()
            .withAmountMinor(5900)
            .withEffectiveFrom('2026-03-11')
            .build(),
        ])
        .build(),
    );
  const seedPrice = (effectiveFrom: string, amountMinor = 4900): void =>
    prices.seed(
      new FeaturePriceBuilder()
        .withVersions([
          new FeaturePriceVersionBuilder()
            .withAmountMinor(amountMinor)
            .withEffectiveFrom(effectiveFrom)
            .build(),
        ])
        .build(),
    );
  const suspended = (timezone = 'America/Sao_Paulo'): Subscription =>
    new SubscriptionBuilder()
      .withSuspension('NON_PAYMENT', NOW)
      .withTimezone(timezone)
      .withItems([
        new SubscriptionItemBuilder().withStartsAt(new Date('2026-01-01T03:00:00Z')).build(),
      ])
      .build();

  it('builds one RECOVERY charge for the selected plan at the price in force, due a week after today', async () => {
    seedPrice('2026-01-01');

    const charge = await planner.plan(suspended(), NOW);

    expect(charge).toMatchObject({ kind: 'RECOVERY', status: 'PENDING' });
    expect(charge?.amount.amountMinor).toBe(4900);
    expect(charge?.lines).toHaveLength(1);
    expect(charge?.dueDate.value).toBe('2026-03-17');
  });

  it('prices on the subscription-timezone date, not the UTC one', async () => {
    // In force from 2026-03-11: that day has begun in Auckland but not yet in UTC or São Paulo.
    seedPrice('2026-03-11');

    const auckland = await planner.plan(suspended('Pacific/Auckland'), NOW);

    expect(auckland?.amount.amountMinor).toBe(4900);
    await expect(planner.plan(suspended('America/Sao_Paulo'), NOW)).rejects.toBeInstanceOf(
      FeaturePriceNotFoundError,
    );
  });

  it('builds nothing when the subscription already has an open recovery charge', async () => {
    seedPrice('2026-01-01');
    const subscription = suspended();
    await charges.save(
      new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .asRecovery()
        .build(),
    );

    await expect(planner.plan(subscription, NOW)).resolves.toBeNull();
  });

  it('a missing price is a typed error, never a zero price', async () => {
    await expect(planner.plan(suspended(), NOW)).rejects.toBeInstanceOf(FeaturePriceNotFoundError);
  });

  describe('the per-run price cache', () => {
    it('asks the price list once per distinct item however many subscriptions are priced, and every one gets the same amount', async () => {
      seedPrices();
      const lookups = jest.spyOn(prices, 'findByNaturalKey');
      const cache: RecoveryPriceCache = new Map();

      const first = await planner.plan(suspended(), NOW, cache);
      const second = await planner.plan(suspended(), NOW, cache);
      const third = await planner.plan(suspended(), NOW, cache);

      expect(lookups).toHaveBeenCalledTimes(1);
      expect([first, second, third].map((charge) => charge?.amount.amountMinor)).toEqual([
        4900, 4900, 4900,
      ]);
    });

    it('is opt-in: without a cache every call asks the price list', async () => {
      seedPrice('2026-01-01');
      const lookups = jest.spyOn(prices, 'findByNaturalKey');

      await planner.plan(suspended(), NOW);
      await planner.plan(suspended(), NOW);

      expect(lookups).toHaveBeenCalledTimes(2);
    });

    it('never mixes dates: another local date is another price', async () => {
      seedPrices();
      const lookups = jest.spyOn(prices, 'findByNaturalKey');
      const cache: RecoveryPriceCache = new Map();

      // 12:00 on 2026-03-10 in São Paulo, already 2026-03-11 in Auckland: the day the price changes.
      const saoPaulo = await planner.plan(suspended(), NOW, cache);
      const auckland = await planner.plan(suspended('Pacific/Auckland'), NOW, cache);

      expect(lookups).toHaveBeenCalledTimes(2);
      expect(saoPaulo?.amount.amountMinor).toBe(4900);
      expect(auckland?.amount.amountMinor).toBe(5900);
    });
  });
});
