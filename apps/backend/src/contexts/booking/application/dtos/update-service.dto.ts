import { z } from 'zod';

export const UpdateServiceSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    priceAmount: z.number().positive().optional(),
    durationMinutes: z.number().int().positive().optional(),
    loyaltyPointsValue: z.number().int().min(0).optional(),
    requiresPickupAddress: z.boolean().optional(),
  })
  .default({});

export type UpdateServiceDto = z.infer<typeof UpdateServiceSchema>;
