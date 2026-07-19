import { z } from 'zod';
import { ALLOWED_IMAGE_CONTENT_TYPES, GenericErrorCode } from '@ikaro/types';

export const GenerateAttachmentSignedUrlSchema = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine((v) => !v.includes('/') && !v.includes('..'), {
      error: 'fileName must not contain path separators or ".."',
      params: { code: GenericErrorCode.FORMAT_INVALID },
    }),
  contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES),
});

export type GenerateAttachmentSignedUrlDto = z.infer<typeof GenerateAttachmentSignedUrlSchema>;
