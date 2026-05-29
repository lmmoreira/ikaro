import { z } from 'zod';

export const RedeemPointsSchema = z.object({
  customerId: z.uuid(),
  pointsToRedeem: z.number().int().min(1),
  notes: z.string().optional().nullable(),
  bookingId: z.uuid().optional().nullable(),
});

export type RedeemPointsDto = z.infer<typeof RedeemPointsSchema>;
