import { z } from 'zod';

export const CompleteBookingBodySchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.uuid(),
        actualPriceCharged: z.number().nonnegative(),
      }),
    )
    .min(1),
  afterServicePhotoUrls: z.array(z.string()).optional().default([]),
  adminNotes: z.string().optional(),
});

export type CompleteBookingBody = z.infer<typeof CompleteBookingBodySchema>;

export interface CompleteBookingDto {
  bookingId: string;
  lines: { lineId: string; actualPriceCharged: number }[];
  afterServicePhotoUrls: string[];
  adminNotes?: string;
}
