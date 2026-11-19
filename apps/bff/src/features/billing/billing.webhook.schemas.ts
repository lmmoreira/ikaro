import { z } from 'zod';

// The provider's own JSON, forwarded to the backend as it arrived: the BFF only authenticates it
// (the token header), the backend adapter reads it. So the shape is "a JSON object", nothing more:
// a field-by-field schema here would be a second copy of the adapter's parser.
export const ProviderWebhookBodySchema = z.record(z.string(), z.unknown());
export type ProviderWebhookBody = z.infer<typeof ProviderWebhookBodySchema>;
