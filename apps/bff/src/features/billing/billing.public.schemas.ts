import { z } from 'zod';
import { DATE, FEATURE_KEY, MINOR, TIER } from './billing.schemas';

// Shape only (UC-128): the query parameter is present and a string. Whether it is a country, a known
// one, or one a visitor can sign up from is the backend's (`CountryCode` and the use case), so one
// layer reports each condition (docs/ENGINEERING_RULES_SHARED.md § Schema-level enforcement).
export const PublicPricesQuerySchema = z.object({
  country: z.string(),
});

export type PublicPricesQuery = z.infer<typeof PublicPricesQuerySchema>;

// The backend's public price list, parsed at the BFF boundary. Every object is declared field by
// field and zod strips what is not declared, so the per-item `cycle`, `currency` and `effectiveFrom`
// the backend carries for its other readers never reach the visitor.
export const BackendPublicPricesSchema = z.discriminatedUnion('offered', [
  z.object({ offered: z.literal(false) }),
  z.object({
    offered: z.literal(true),
    countryCode: z.string(),
    currency: z.string(),
    taxBehavior: z.enum(['INCLUSIVE', 'EXCLUSIVE']),
    prices: z.array(
      z.object({
        featureKey: FEATURE_KEY,
        tier: TIER,
        amountMinor: MINOR,
        upcoming: z.object({ amountMinor: MINOR, effectiveFrom: DATE }).optional(),
      }),
    ),
  }),
]);
