import { z } from 'zod';
import { BOOKING_TMP_PHOTO_PATH_REGEX } from '../../../../shared/utils/tmp-path-regex';

export const SubmitBookingInfoBodySchema = z.object({
  bookingId: z.uuid(),
  response: z.string().trim().min(1),
  // Uploads always target tmp/ staging (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md) — promotion to
  // tenants/<id>/bookings/<bookingId>/... happens server-side once the booking is saved.
  photoUrls: z.array(z.string().regex(BOOKING_TMP_PHOTO_PATH_REGEX)).optional(),
});

export type SubmitBookingInfoDto = z.infer<typeof SubmitBookingInfoBodySchema>;
