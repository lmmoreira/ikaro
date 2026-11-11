// Billing closed enums (M25-S04) — canonical constant arrays. The backend and BFF may not import
// the `@ikaro/types` root barrel, so they take these from here (as they do HOTSITE_MODULE_TYPES);
// `packages/types/src/enums.ts` carries the mirror unions the web imports. The `closedEnumRegistry`
// entries in `packages/architecture-check/architecture-policy.json` keep the two identical: a new
// member must land in both files in the same change.
//
// Recurring reservations and availability alerts are part of `BOOKING`, not separate keys.
export const FEATURE_KEYS = ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

// `CHATBOT` is the only feature with more than one tier; every other feature has the single
// tier `STANDARD` (docs/DOMAIN_MODEL.md § FeatureKey / ChatbotTier).
export const CHATBOT_TIERS = ['BASIC', 'PLUS'] as const;

export type ChatbotTier = (typeof CHATBOT_TIERS)[number];

/**
 * The feature-dependency graph (docs/DOMAIN_MODEL.md Context 7): `HOTSITE` is the root and can
 * never be left out of a non-empty plan, because every other feature needs it directly or through
 * `BOOKING`. Only direct requirements are listed: a closed selection (every member's direct
 * requirements present) is closed transitively. One copy, shared by Platform (the request-boundary
 * check on `POST /internal/tenants`) and Billing (the `Subscription` aggregate's plan rules).
 */
export const FEATURE_REQUIREMENTS: Readonly<Record<FeatureKey, readonly FeatureKey[]>> = {
  HOTSITE: [],
  BOOKING: ['HOTSITE'],
  LOYALTY: ['BOOKING'],
  CHATBOT: ['HOTSITE'],
  LEAD_FORM: ['HOTSITE'],
};

export interface UnmetFeatureRequirement {
  readonly feature: FeatureKey;
  readonly required: FeatureKey;
}

/**
 * The first selected feature (in catalogue order) whose direct requirement is not in `keys`, or
 * `null` when the selection is closed under the graph. Pure: it checks the graph only, not
 * emptiness, duplicates or tiers.
 */
export function findUnmetFeatureRequirement(
  keys: readonly FeatureKey[],
): UnmetFeatureRequirement | null {
  const selected = new Set<FeatureKey>(keys);
  for (const feature of FEATURE_KEYS) {
    if (!selected.has(feature)) continue;
    for (const required of FEATURE_REQUIREMENTS[feature]) {
      if (!selected.has(required)) return { feature, required };
    }
  }
  return null;
}
