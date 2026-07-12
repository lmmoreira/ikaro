import { Body, Controller, Post } from '@nestjs/common';
import { basename } from 'node:path';
import { z } from 'zod';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';

// Enum mismatch here shares GenericErrorCode.VALUE_INVALID with every other z.enum() check —
// no VO backs "which content types are uploadable" (docs/ENGINEERING_RULES.md § Single source
// of truth for a validation rule's code).
const SignedUrlBodySchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png']),
  filename: z.string().min(1),
});

export type SignedUrlRequest = z.infer<typeof SignedUrlBodySchema>;

export interface SignedUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

@Controller('uploads')
export class UploadsController {
  @Post('signed-url')
  getSignedUrl(
    @Body(new ZodValidationPipe(SignedUrlBodySchema)) body: SignedUrlRequest,
  ): SignedUrlResponse {
    const key = `uploads/${Date.now()}-${sanitizeUploadFilename(body.filename)}`;
    return {
      uploadUrl: `http://localhost:4443/ikaro-local/${key}`,
      key,
      expiresIn: 900,
    };
  }
}

function sanitizeUploadFilename(filename: string): string {
  const base = basename(filename).replace(/[^a-zA-Z0-9.-]+/g, '_');
  return base.length > 0 ? base : 'file';
}
