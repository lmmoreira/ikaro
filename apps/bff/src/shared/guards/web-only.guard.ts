import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as crypto from 'node:crypto';
import { AuthErrorCode } from '@ikaro/types';
import { throwProblemDetail } from '../http/problem-detail';
import { BYPASS_WEB_ONLY_GUARD_KEY } from '../decorators/bypass-web-only-guard.decorator';

// TD38: BFF's Cloud Run ingress is locked to internal-only and its `allUsers` public invoker
// grant is removed, so the only network path in is via ikaro-web's IAM-authenticated
// server-side call. This guard is the app-layer defense-in-depth companion to that IAM check
// (mirrors apps/backend/src/shared/guards/internal-api.guard.ts exactly) — a second,
// independent layer so a Cloud Run IAM misconfiguration alone doesn't leave BFF fully open.
//
// Deliberately has NO @Public() escape hatch: every BFF route, including today's @Public()
// (no-JWT) ones for guest/hotsite/health traffic, must pass this check — nothing legitimate
// calls BFF except ikaro-web, @Public() or not (see TD38's own note on this being an
// orthogonal axis from JWT auth). The one narrow exception is @BypassWebOnlyGuard()
// (HealthController) — Cloud Run's own startup/liveness probes can't present
// X-Web-Internal-Key, and @Public() is too broad a marker to reuse for this.
@Injectable()
export class WebOnlyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const bypass = this.reflector.getAllAndOverride<boolean>(BYPASS_WEB_ONLY_GUARD_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (bypass) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const incomingKey = req.headers['x-web-internal-key'];

    const storedKey = this.config.getOrThrow<string>('WEB_INTERNAL_KEY');

    // Hash both sides to normalise length before timingSafeEqual (prevents key-length leaks) —
    // same construction as InternalApiGuard.
    const storedHash = crypto.createHash('sha256').update(storedKey).digest();
    const incomingHash = crypto
      .createHash('sha256')
      .update(incomingKey ?? '')
      .digest();

    if (!incomingKey || !crypto.timingSafeEqual(storedHash, incomingHash)) {
      throw throwProblemDetail(
        HttpStatus.UNAUTHORIZED,
        AuthErrorCode.UNAUTHORIZED,
        'Missing or invalid X-Web-Internal-Key header',
      );
    }

    return true;
  }
}
