import { z } from 'zod';

export const UpdateServiceSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    priceAmount: z.number().positive().optional(),
    durationMinutes: z.number().int().positive().optional(),
    loyaltyPointsValue: z.number().int().min(0).optional(),
    requiresPickupAddress: z.boolean().optional(),
    // Disabled once the service has legs (UC-053 A1) — enforced by the aggregate, not here.
    bufferAfterMinutes: z.number().int().optional(),
    // Immutable once the service has booking history (UC-056 A1) — enforced by the aggregate.
    bookingModel: z.enum(['APPOINTMENT', 'SESSION']).optional(),
  })
  .default({});

export type UpdateServiceDto = z.infer<typeof UpdateServiceSchema>;
