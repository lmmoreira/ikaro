import { z } from 'zod';
import { CreateAvailabilityAlertBodySchema as CreateAvailabilityAlertSchema } from '@ikaro/validation';

// Shared with the BFF body schema (packages/validation/src/booking.ts) — same body, one
// definition (bad-smell-audit BFF-5).
export { CreateAvailabilityAlertSchema };

export type CreateAvailabilityAlertDto = z.infer<typeof CreateAvailabilityAlertSchema>;
