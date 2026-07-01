import { z } from 'zod';

export const RejectBookingSchema = z.object({
  reason: z.string().trim().min(10),
});

export type RejectBookingDto = z.infer<typeof RejectBookingSchema>;
