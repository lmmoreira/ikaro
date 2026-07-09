import { z } from 'zod';
import { BookingTmpPhotoPathsSchema } from '../../../../shared/utils/tmp-path-regex';

export const SubmitGuestBookingInfoBodySchema = z.object({
  bookingId: z.uuid(),
  contactEmail: z.email(),
  response: z.string().trim().min(1),
  photoUrls: BookingTmpPhotoPathsSchema.optional(),
});

export type SubmitGuestBookingInfoDto = z.infer<typeof SubmitGuestBookingInfoBodySchema>;
