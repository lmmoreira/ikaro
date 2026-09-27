import { z } from 'zod';
import { ResourceSelectionSchema } from '@ikaro/validation';

// M23 Cluster 3 (UC-069) — customer-initiated reschedule. No adminNotes (staff-only field).
export const RescheduleBookingAsCustomerSchema = z.object({
  scheduledAt: z.iso.datetime(),
  resourceSelections: z.array(ResourceSelectionSchema).max(100).optional(),
  durationMinutes: z.number().int().positive().optional(),
});

export type RescheduleBookingAsCustomerDto = z.infer<typeof RescheduleBookingAsCustomerSchema>;
