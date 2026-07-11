import { z } from 'zod';
import { PlatformErrorCode } from '@ikaro/types';

export const FeatureBookingPhotoSchema = z
  .object({
    bookingId: z.uuid(),
    filePath: z.string().regex(/^tenants\/[^/]+\/bookings\/[^/]+\/.+$/),
    photoType: z.enum(['before', 'after']),
  })
  .refine((data) => data.filePath.includes(`/bookings/${data.bookingId}/`), {
    error: 'filePath must belong to the provided bookingId',
    params: { code: PlatformErrorCode.FEATURED_PHOTO_PATH_MISMATCH },
  });

export type FeatureBookingPhotoDto = z.infer<typeof FeatureBookingPhotoSchema>;
