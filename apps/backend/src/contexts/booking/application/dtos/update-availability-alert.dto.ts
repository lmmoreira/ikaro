import { z } from 'zod';
import { UpdateAvailabilityAlertBodySchema as UpdateAvailabilityAlertSchema } from '@ikaro/validation';

// Shared with the BFF body schema (packages/validation/src/booking.ts) — same body, one
// definition (bad-smell-audit BFF-5).
export { UpdateAvailabilityAlertSchema };

export type UpdateAvailabilityAlertDto = z.infer<typeof UpdateAvailabilityAlertSchema>;
