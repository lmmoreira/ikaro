import { z } from 'zod';

// Shape only (UC-127, UC-128): the query parameter is present and a string. Every verdict (`available`,
// `taken`, `reserved`, `invalid` and its reason) is the backend's SlugPolicy; the BFF never checks
// length, characters or reserved words, so one layer reports each condition
// (docs/ENGINEERING_RULES_SHARED.md § Schema-level enforcement).
export const SlugAvailabilityQuerySchema = z.object({
  slug: z.string(),
});

export type SlugAvailabilityQuery = z.infer<typeof SlugAvailabilityQuerySchema>;

// The body of `POST /v1/public/signup/tenant`: shape only again. The slug, the country, the tax id
// and the Terms version are each judged by the context that owns them (Platform: the slug and
// Turnstile; Billing: the country, the tax id and the Terms version), so a blank tax id or Terms
// version is not a BFF 400: it reaches Billing and comes back as SIGNUP_TAX_ID_REQUIRED or
// SIGNUP_TERMS_NOT_ACCEPTED. The visitor's email and name are never in the body: they come from the
// signup session.
export const SignupTenantBodySchema = z.object({
  // Trimmed and bounded here, like the backend's `name`: a blank or oversized name must fail before
  // the single-use Turnstile token is spent and a registration is reserved.
  businessName: z.string().trim().min(1).max(120),
  slug: z.string(),
  countryCode: z.string().min(1),
  taxId: z.string().optional(),
  acceptedTermsVersion: z.string().optional(),
  turnstileToken: z.string().min(1),
});

export type SignupTenantBody = z.infer<typeof SignupTenantBodySchema>;
