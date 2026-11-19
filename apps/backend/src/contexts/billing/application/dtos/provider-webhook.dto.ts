import { z } from 'zod';
import type { BillingProvider } from '../../domain/billing-account.aggregate';

// The provider slugs the webhook route serves. `stripe` arrives with M28, so it is refused here
// (a `400`, never a silent acknowledgement of a body nothing can read).
export const WEBHOOK_PROVIDER_BY_SLUG: Readonly<Record<string, BillingProvider>> = {
  asaas: 'ASAAS',
};

export const WebhookProviderSlugSchema = z
  .string()
  .refine((slug) => Object.hasOwn(WEBHOOK_PROVIDER_BY_SLUG, slug), {
    message: 'Unsupported billing provider',
  });
