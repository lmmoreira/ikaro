import { z } from 'zod';
import { ResourceSelectionSchema } from '@ikaro/validation';

export const RescheduleBookingSchema = z.object({
  scheduledAt: z.iso.datetime(),
  adminNotes: z.string().trim().min(1).max(500).optional(),
  // M23 Cluster 3 (UC-069 A3, staff override) — same optional fields as the customer body below;
  // never subject to the reschedule-window eligibility check.
  resourceSelections: z.array(ResourceSelectionSchema).max(100).optional(),
  durationMinutes: z.number().int().positive().optional(),
});

export type RescheduleBookingDto = z.infer<typeof RescheduleBookingSchema>;
