import { z } from 'zod';

export const RescheduleBookingSchema = z.object({
  scheduledAt: z.iso.datetime(),
  adminNotes: z.string().trim().min(1).max(500).optional(),
});

export type RescheduleBookingDto = z.infer<typeof RescheduleBookingSchema>;
