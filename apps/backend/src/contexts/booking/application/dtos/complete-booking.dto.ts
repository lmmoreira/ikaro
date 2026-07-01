import { z } from 'zod';

export const CompleteBookingSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.uuid(),
        actualPriceCharged: z.number().nonnegative(),
      }),
    )
    .min(1),
  afterServicePhotoUrls: z
    .array(z.string().regex(/^tenants\/[^/]+\/bookings\/[^/]+\/.+$/))
    .optional()
    .default([]),
  adminNotes: z.string().optional(),
  discountByPoints: z
    .object({
      pointsUsed: z.number().int().positive(),
      amountDeducted: z.number().positive(),
    })
    .optional(),
});

export type CompleteBookingDto = z.infer<typeof CompleteBookingSchema>;
