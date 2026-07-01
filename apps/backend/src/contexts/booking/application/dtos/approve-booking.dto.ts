import { z } from 'zod';

export const ApproveBookingSchema = z
  .object({
    scheduledAt: z.iso.datetime().optional(),
  })
  .default({});

export type ApproveBookingDto = z.infer<typeof ApproveBookingSchema>;
