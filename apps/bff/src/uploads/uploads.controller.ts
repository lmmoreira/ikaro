import { BadRequestException, Body, Controller, Post } from '@nestjs/common';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png'] as const;

export interface SignedUrlRequest {
  contentType: string;
  filename: string;
}

export interface SignedUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

@Controller('uploads')
export class UploadsController {
  @Post('signed-url')
  getSignedUrl(@Body() body: SignedUrlRequest): SignedUrlResponse {
    const contentType = body.contentType as (typeof ALLOWED_CONTENT_TYPES)[number];
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new BadRequestException(
        `contentType must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
      );
    }

    const key = `uploads/${Date.now()}-${body.filename}`;
    return {
      uploadUrl: `http://localhost:4443/ikaro-local/${key}`,
      key,
      expiresIn: 900,
    };
  }
}
