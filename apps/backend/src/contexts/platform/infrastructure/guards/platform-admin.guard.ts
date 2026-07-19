import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { throwProblemDetail } from '@ikaro/nestjs-http';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const platformAdminKey = req.headers['x-platform-admin-key'];

    const storedKey = this.config.getOrThrow<string>('PLATFORM_ADMIN_KEY');

    // Hash both sides to normalise length before timingSafeEqual (prevents key-length leaks)
    const storedHash = crypto.createHash('sha256').update(storedKey).digest();
    const incomingHash = crypto
      .createHash('sha256')
      .update(platformAdminKey ?? '')
      .digest();

    if (!platformAdminKey || !crypto.timingSafeEqual(storedHash, incomingHash)) {
      throw throwProblemDetail(
        HttpStatus.UNAUTHORIZED,
        undefined,
        'Invalid or missing platform API key',
      );
    }

    return true;
  }
}
