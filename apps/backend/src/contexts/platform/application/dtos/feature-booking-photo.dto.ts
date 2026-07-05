import { z } from 'zod';

export const FeatureBookingPhotoSchema = z
  .object({
    bookingId: z.uuid(),
    filePath: z.string().regex(/^tenants\/[^/]+\/bookings\/[^/]+\/.+$/),
    photoType: z.enum(['before', 'after']),
  })
  .refine((data) => data.filePath.includes(`/bookings/${data.bookingId}/`), {
    message: 'filePath must belong to the provided bookingId',
  });

export type FeatureBookingPhotoDto = z.infer<typeof FeatureBookingPhotoSchema>;
