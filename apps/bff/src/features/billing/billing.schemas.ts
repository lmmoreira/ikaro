import { CHATBOT_TIERS, FEATURE_KEYS } from '@ikaro/validation';
import { z } from 'zod';

// The backend's `GET /internal/billing/tenants/{id}/access` answer, parsed at the BFF boundary.
// Only the three fields every role-reduced view is built from are declared: zod strips the rest,
// so `suspensionReason`, `provisional` and `degraded` can never reach a mapper, let alone the web.
export const BackendTenantAccessSchema = z.object({
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED']),
  operational: z.boolean(),
  features: z.array(
    z.object({
      key: z.enum(FEATURE_KEYS),
      tier: z.enum(['STANDARD', ...CHATBOT_TIERS]),
    }),
  ),
});
