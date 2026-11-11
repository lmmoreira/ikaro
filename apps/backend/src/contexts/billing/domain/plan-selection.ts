import {
  CHATBOT_TIERS,
  FEATURE_KEYS,
  type FeatureKey,
  findUnmetFeatureRequirement,
} from '@ikaro/validation';
import type { FeatureTier } from './feature-price.aggregate';
import {
  FeatureDependencyUnmetError,
  FeatureHasDependentsError,
  PlanEmptyError,
  SubscriptionInvariantError,
} from './errors/billing-domain.error';

/** One feature of a plan, as a manager selects it: no price, no dates. */
export interface SelectionEntry {
  readonly featureKey: FeatureKey;
  readonly tier: FeatureTier;
}

/** `CHATBOT` defaults to its `BASIC` tier, every other feature has the single tier `STANDARD`. */
export function defaultTierFor(featureKey: FeatureKey): FeatureTier {
  return featureKey === 'CHATBOT' ? 'BASIC' : 'STANDARD';
}

export function isTierSoldFor(featureKey: FeatureKey, tier: FeatureTier): boolean {
  return featureKey === 'CHATBOT'
    ? (CHATBOT_TIERS as readonly string[]).includes(tier)
    : tier === 'STANDARD';
}

export function assertValidTier(entry: SelectionEntry): void {
  if (!isTierSoldFor(entry.featureKey, entry.tier)) {
    throw new SubscriptionInvariantError(
      `Tier ${entry.tier} is not sold for feature ${entry.featureKey}`,
    );
  }
}

/** The default selection: every sellable feature, or the given subset. */
export function defaultSelection(features?: readonly FeatureKey[]): SelectionEntry[] {
  const wanted = features ?? FEATURE_KEYS;
  return FEATURE_KEYS.filter((key) => wanted.includes(key)).map((featureKey) => ({
    featureKey,
    tier: defaultTierFor(featureKey),
  }));
}

/**
 * Validates a proposed FINAL selection as one dependency graph (pure: no clock, no persistence).
 * - `PlanEmptyError` for an empty selection;
 * - for every selected feature whose direct requirement is missing from the selection:
 *   `FeatureHasDependentsError` when that requirement is in `current` (it is being removed while a
 *   selected feature still needs it), else `FeatureDependencyUnmetError`.
 * Removing `HOTSITE` needs no rule of its own: every other feature needs it, so those two errors
 * (or `PlanEmptyError`) cover it. Pass `current = []` to validate a selection that starts a plan.
 */
export function validateSelection(
  current: readonly SelectionEntry[],
  proposed: readonly SelectionEntry[],
): void {
  if (proposed.length === 0) throw new PlanEmptyError();

  const proposedKeys = new Set<FeatureKey>();
  for (const entry of proposed) {
    assertValidTier(entry);
    if (proposedKeys.has(entry.featureKey)) {
      throw new SubscriptionInvariantError(`Feature ${entry.featureKey} is selected twice`);
    }
    proposedKeys.add(entry.featureKey);
  }
  const currentKeys = new Set(current.map((entry) => entry.featureKey));

  // The graph itself is shared with Platform (`@ikaro/validation`); only the typed errors are Billing's.
  const unmet = findUnmetFeatureRequirement([...proposedKeys]);
  if (unmet !== null) {
    throw currentKeys.has(unmet.required)
      ? new FeatureHasDependentsError(unmet.required, unmet.feature)
      : new FeatureDependencyUnmetError(unmet.feature, unmet.required);
  }
}
