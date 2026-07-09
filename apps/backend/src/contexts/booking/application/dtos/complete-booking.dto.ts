import { z } from 'zod';
import { BOOKING_TMP_PHOTO_PATH_REGEX } from '../../../../shared/utils/tmp-path-regex';

export const CompleteBookingSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.uuid(),
        actualPriceCharged: z.number().nonnegative(),
      }),
    )
    .min(1),
  // Uploads always target tmp/ staging (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md) — promotion to
  // tenants/<id>/bookings/<bookingId>/... happens server-side once the booking is saved.
  afterServicePhotoUrls: z
    .array(z.string().regex(BOOKING_TMP_PHOTO_PATH_REGEX))
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
