import { z } from 'zod';

export const FeatureBookingPhotoSchema = z.object({
  bookingId: z.uuid(),
  photoUrl: z.string().regex(/^tenants\/[^/]+\/bookings\/[^/]+\/.+$/),
});

export type FeatureBookingPhotoDto = z.infer<typeof FeatureBookingPhotoSchema>;
