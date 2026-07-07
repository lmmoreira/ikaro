import { z } from 'zod';

export const GenerateHotsiteImageSignedUrlSchema = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine((v) => !v.includes('/') && !v.includes('..'), {
      message: 'fileName must not contain path separators or ".."',
    }),
  contentType: z.enum(['image/jpeg', 'image/png']),
  purpose: z.enum(['branding', 'hero', 'gallery', 'about', 'booking-cta', 'testimonials']),
});

export type GenerateHotsiteImageSignedUrlDto = z.infer<typeof GenerateHotsiteImageSignedUrlSchema>;
