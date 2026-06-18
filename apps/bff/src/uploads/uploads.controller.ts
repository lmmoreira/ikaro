import { Controller, Post, Body, BadRequestException } from '@nestjs/common';

interface SignedUrlRequest {
  contentType: string;
  filename: string;
}

interface SignedUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png'];

@Controller('uploads')
export class UploadsController {
  @Post('signed-url')
  getSignedUrl(@Body() body: SignedUrlRequest): SignedUrlResponse {
    if (!ALLOWED_CONTENT_TYPES.includes(body.contentType)) {
      throw new BadRequestException(
        `contentType must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
      );
    }

    // Stub — real GCS signed URL logic implemented in M09 (photo upload)
    const key = `uploads/${Date.now()}-${body.filename}`;
    return {
      uploadUrl: `http://localhost:4443/ikaro-local/${key}`,
      key,
      expiresIn: 900,
    };
  }
}
