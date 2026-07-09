import { z } from 'zod';
import { BookingTmpPhotoPathsSchema } from '../../../../shared/utils/tmp-path-regex';

export const SubmitBookingInfoBodySchema = z.object({
  bookingId: z.uuid(),
  response: z.string().trim().min(1),
  photoUrls: BookingTmpPhotoPathsSchema.optional(),
});

export type SubmitBookingInfoDto = z.infer<typeof SubmitBookingInfoBodySchema>;
