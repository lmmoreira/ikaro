import { z } from 'zod';
import { GenericErrorCode } from '@ikaro/types/protocol/errors';
import { HOTSITE_IMAGE_PURPOSES } from '@ikaro/types';
import { ALLOWED_IMAGE_CONTENT_TYPES } from '@ikaro/types/protocol/media';

export const GenerateHotsiteImageSignedUrlSchema = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine((v) => !v.includes('/') && !v.includes('..'), {
      error: 'fileName must not contain path separators or ".."',
      params: { code: GenericErrorCode.FORMAT_INVALID },
    }),
  contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES),
  purpose: z.enum(HOTSITE_IMAGE_PURPOSES),
});

export type GenerateHotsiteImageSignedUrlDto = z.infer<typeof GenerateHotsiteImageSignedUrlSchema>;
