import { z } from 'zod';
import { GenericErrorCode } from '@ikaro/types';

export const GenerateHotsiteImageSignedUrlSchema = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine((v) => !v.includes('/') && !v.includes('..'), {
      error: 'fileName must not contain path separators or ".."',
      params: { code: GenericErrorCode.FORMAT_INVALID },
    }),
  contentType: z.enum(['image/jpeg', 'image/png']),
  purpose: z.enum(['branding', 'hero', 'gallery', 'about', 'booking-cta', 'testimonials']),
});

export type GenerateHotsiteImageSignedUrlDto = z.infer<typeof GenerateHotsiteImageSignedUrlSchema>;
