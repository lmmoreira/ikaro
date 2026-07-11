import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { ProblemDetail } from '@ikaro/types';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const storedKey = this.config.getOrThrow<string>('PLATFORM_ADMIN_KEY');

    // Hash both sides to normalise length before timingSafeEqual (prevents key-length leaks)
    const storedHash = crypto.createHash('sha256').update(storedKey).digest();
    const incomingHash = crypto
      .createHash('sha256')
      .update(token ?? '')
      .digest();

    if (!token || !crypto.timingSafeEqual(storedHash, incomingHash)) {
      const body: ProblemDetail = {
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Invalid or missing platform API key',
      };
      throw new UnauthorizedException(body);
    }

    return true;
  }
}
