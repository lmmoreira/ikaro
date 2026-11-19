import type { FeatureKey } from '@ikaro/validation';
import { ChargeInvariantError } from './errors/billing-domain.error';
import type { FeatureTier } from './feature-price.aggregate';
import { assertValidTier } from './plan-selection';
import type { MinorAmount } from './value-objects/minor-amount.vo';

export interface ChargeLineProps {
  readonly featureKey: FeatureKey;
  readonly tier: FeatureTier;
  // The price snapshot at charge time: copied from the version in force, never recomputed.
  readonly unitPrice: MinorAmount;
}

/**
 * One feature of a charge with the price it was billed at. A plain immutable value: a charge's
 * lines are written once with the charge and never change (docs/DOMAIN_MODEL.md § Aggregate: Charge).
 */
export class ChargeLine {
  readonly featureKey: FeatureKey;
  readonly tier: FeatureTier;
  readonly unitPrice: MinorAmount;

  private constructor(props: ChargeLineProps) {
    this.featureKey = props.featureKey;
    this.tier = props.tier;
    this.unitPrice = props.unitPrice;
    Object.freeze(this);
  }

  /** Rejects a tier the feature does not sell (the same rule a subscription item follows). */
  static create(props: ChargeLineProps): ChargeLine {
    try {
      assertValidTier(props);
    } catch {
      throw new ChargeInvariantError(`${props.featureKey} has no tier ${props.tier}`);
    }
    return new ChargeLine(props);
  }

  static reconstitute(props: ChargeLineProps): ChargeLine {
    return new ChargeLine(props);
  }

  get unitPriceMinor(): number {
    return this.unitPrice.amountMinor;
  }
}
