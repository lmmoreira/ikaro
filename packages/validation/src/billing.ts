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

// The provider's own JSON, forwarded by the BFF to the backend as it arrived (M26-S04, UC-114). The
// BFF only authenticates it (the token header) and the backend adapter reads it (`parseWebhook`),
// so the shape both apps validate is just "a JSON object": a field-by-field schema in either would
// be a second copy of the adapter's parser. One definition, imported by both.
export const ProviderWebhookBodySchema = z.record(z.string(), z.unknown());
export type ProviderWebhookBody = z.infer<typeof ProviderWebhookBodySchema>;
