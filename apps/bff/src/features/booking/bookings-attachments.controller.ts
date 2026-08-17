import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { Public } from '../../shared/decorators/public.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { resolveTenantIdForAttachmentUpload } from './attachment-tenant-resolver';
import { AttachmentSignedUrlResponse } from './bookings.types';
import { AttachmentSignedUrlBody, AttachmentSignedUrlBodySchema } from './bookings.schemas';

// Split out of bookings.controller.ts (TD37-S05, file-length) — the attachment-upload endpoint,
// a distinct concern (signed-URL issuance ahead of booking creation, tenant resolved from a
// JWT/tenantSlug/guestToken, never a route param). Same @Controller('bookings') base and route
// as before the split, so no URL changes.
@Controller('bookings')
export class BookingAttachmentsController {
  private readonly jwtSecret: string;

  constructor(
    private readonly backendHttp: BackendHttpService,
    private readonly config: ConfigService,
  ) {
    this.jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
  }

  @Post('attachments/signed-url')
  @HttpCode(HttpStatus.CREATED)
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async generateAttachmentSignedUrl(
    @Headers('authorization') authHeader: string | undefined,
    @Body(new ZodValidationPipe(AttachmentSignedUrlBodySchema)) body: AttachmentSignedUrlBody,
  ): Promise<AttachmentSignedUrlResponse> {
    // Must use postForPublic because this route is @Public() — JwtAuthGuard does not run,
    // so req.user is unset and post() would send an empty X-Tenant-ID header.
    // Uploads always target tmp/ staging now (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md) — a
    // bookingId is no longer needed at upload time, only tenant resolution is.
    const tenantId = await resolveTenantIdForAttachmentUpload(this.backendHttp, {
      authHeader,
      guestToken: body.guestToken,
      tenantSlug: body.tenantSlug,
      jwtSecret: this.jwtSecret,
    });

    return this.backendHttp.postForPublic<AttachmentSignedUrlResponse>(
      '/bookings/attachments/signed-url',
      { fileName: body.fileName, contentType: body.contentType },
      tenantId,
    );
  }
}
