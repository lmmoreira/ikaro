import { z } from 'zod';

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

// `GET /billing/charges?limit=&offset=` (M26-S14, UC-117): Pattern A offset pagination, `limit`
// 1–100 (default 25), `offset` ≥ 0 (docs/API_CONTRACTS.md). One schema for both apps: the BFF
// rejects an out-of-range page at the edge and the backend repeats the check, with no second copy
// to drift.
export const BillingChargesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type BillingChargesQuery = z.infer<typeof BillingChargesQuerySchema>;

// `POST /billing/plan/preview` (M26-S17, UC-136): the proposed FINAL selection. One schema for both
// apps (the BFF rejects a malformed body at the edge, the backend repeats the check), so a tier that
// is not sold for its feature or a feature listed twice is a `400` and never reaches the aggregate,
// where it would be an unmapped invariant error. `CHATBOT` is sold as `BASIC` or `PLUS`, every other
// feature as `STANDARD`.
const PLAN_TIERS = ['STANDARD', ...CHATBOT_TIERS] as const;

export const PlanSelectionItemSchema = z
  .object({
    featureKey: z.enum(FEATURE_KEYS),
    tier: z.enum(PLAN_TIERS),
  })
  .refine(
    ({ featureKey, tier }) =>
      featureKey === 'CHATBOT' ? tier !== 'STANDARD' : tier === 'STANDARD',
    { message: 'tier is not sold for this feature', path: ['tier'] },
  );

export const PlanPreviewSchema = z.object({
  items: z
    .array(PlanSelectionItemSchema)
    .max(FEATURE_KEYS.length)
    .refine((items) => new Set(items.map((item) => item.featureKey)).size === items.length, {
      message: 'a feature can be selected only once',
    }),
});

export type PlanSelectionItem = z.infer<typeof PlanSelectionItemSchema>;
export type PlanPreviewDto = z.infer<typeof PlanPreviewSchema>;
