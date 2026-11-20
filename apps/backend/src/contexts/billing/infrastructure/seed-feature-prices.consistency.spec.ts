import { CHATBOT_TIERS, FEATURE_KEYS } from '@ikaro/validation';
import type { FeatureTier } from '../domain/feature-price.aggregate';
import { isTierSoldFor } from '../domain/plan-selection';
import { BR_PRICES, type SeedPrice, US_PRICES } from './migrations/1748500000040-SeedFeaturePrices';

// UC-113 A6: a missing renewable price is prevented here, in CI, never by a boot crash (a bad price
// row must not take the whole backend down); at runtime the issue job skips that subscription.
// Every country the app can sign up must have a complete price set. BR only until M28; the US list
// is seeded in every environment all the same (UC-127 A7), so it is held to the same bar.
const SIGNUP_COUNTRIES = ['BR'] as const;
const SEEDED_LISTS: Readonly<Record<string, SeedPrice[]>> = { BR: BR_PRICES, US: US_PRICES };

const ALL_TIERS: readonly FeatureTier[] = ['STANDARD', ...CHATBOT_TIERS];

// Every (feature, tier) a plan can hold: the one the whole catalog sells.
const SOLD_COMBINATIONS: ReadonlyArray<readonly [string, FeatureTier]> = FEATURE_KEYS.flatMap(
  (featureKey) =>
    ALL_TIERS.filter((tier) => isTierSoldFor(featureKey, tier)).map(
      (tier) => [featureKey, tier] as const,
    ),
);

/** The (feature, tier) combinations a country's list does not price, `[]` when it is complete. */
function missingPrices(prices: readonly SeedPrice[]): string[] {
  return SOLD_COMBINATIONS.filter(
    ([featureKey, tier]) =>
      !prices.some((price) => price.featureKey === featureKey && price.tier === tier),
  ).map(([featureKey, tier]) => `${featureKey}/${tier}`);
}

describe('seeded feature prices (M25-S04): a complete set per country', () => {
  it.each(Object.entries(SEEDED_LISTS))(
    '%s prices every feature and tier a plan can hold',
    (_country, prices) => {
      expect(missingPrices(prices)).toEqual([]);
    },
  );

  it('prices each combination exactly once, with a positive amount', () => {
    for (const prices of Object.values(SEEDED_LISTS)) {
      const keys = prices.map((price) => `${price.featureKey}/${price.tier}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(prices.every((price) => price.amountMinor > 0)).toBe(true);
    }
  });

  it.each(SIGNUP_COUNTRIES)('%s, a signup country, has a seeded list', (country) => {
    expect(Object.keys(SEEDED_LISTS)).toContain(country);
  });

  it('fails for a country whose list is incomplete (the check is not vacuous)', () => {
    const withoutChatbotPlus = BR_PRICES.filter(
      (price) => !(price.featureKey === 'CHATBOT' && price.tier === 'PLUS'),
    );

    expect(missingPrices(withoutChatbotPlus)).toEqual(['CHATBOT/PLUS']);
  });
});
