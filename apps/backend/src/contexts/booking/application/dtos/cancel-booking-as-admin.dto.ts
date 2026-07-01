import { z } from 'zod';

export const CancelBookingAsAdminSchema = z
  .object({
    reason: z.string().min(1).optional(),
  })
  .default({});

export type CancelBookingAsAdminDto = z.infer<typeof CancelBookingAsAdminSchema>;
