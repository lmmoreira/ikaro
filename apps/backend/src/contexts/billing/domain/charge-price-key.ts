import type { FeatureKey } from '@ikaro/validation';
import type { FeatureTier } from './feature-price.aggregate';

/**
 * The key of one resolved price in the map a charge factory takes (`PeriodChargeFactory`,
 * `RecoveryChargeFactory`): the item's `featureKey` and `tier`.
 */
export function chargePriceKey(featureKey: FeatureKey, tier: FeatureTier): string {
  return `${featureKey}/${tier}`;
}
