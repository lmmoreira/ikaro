import { z } from 'zod';
import {
  CreateAvailabilityAlertBodySchema,
  UpdateAvailabilityAlertBodySchema,
} from '@ikaro/validation';

// Re-exported so the controller and its specs import from one place — the backend DTOs and this
// BFF take identical bodies (bad-smell-audit BFF-5), so the schemas live once in
// packages/validation/src/booking.ts instead of hand-written copies per app.
export { CreateAvailabilityAlertBodySchema, UpdateAvailabilityAlertBodySchema };

export type CreateAvailabilityAlertBody = z.infer<typeof CreateAvailabilityAlertBodySchema>;
export type UpdateAvailabilityAlertBody = z.infer<typeof UpdateAvailabilityAlertBodySchema>;
