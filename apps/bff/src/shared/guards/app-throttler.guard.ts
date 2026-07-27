import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { AuthErrorCode } from '@ikaro/types';
import { ClientIpRequest, getClientIp } from '../http/client-ip';
import { throwProblemDetail } from '../http/problem-detail';

// Overrides three extension points on ThrottlerGuard (M17-S30):
// - shouldSkip: rate limiting only ever protects a real deployed environment (staging/prod);
//   `local` — the default when APP_ENV is unset, which covers both a developer's machine and
//   CI (nothing sets APP_ENV in the Playwright/E2E jobs) — is exempt entirely. Without this,
//   the shared 60/min-per-IP default applies to every BFF call from every parallel E2E worker,
//   all sharing one CI runner IP — genuinely exceeded by ordinary test traffic, not abuse
//   (discovered via PR #167's second CI run: a scattered ~30-test failure across unrelated
//   routes, not just the /auth/* tier one per-route @SkipThrottle can patch).
// - getTracker: keys the limit on the correctly-resolved client IP (never the raw socket peer,
//   which is Cloudflare/the ALB/Cloud Run's front end in every real environment — see
//   shared/http/client-ip.ts).
// - throwThrottlingException: converts the library's default, non-RFC-9457 429 body into this
//   app's standard Problem Detail envelope.
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(AppThrottlerGuard.name);

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  protected override async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    const appEnv = this.config.get<string>('APP_ENV') ?? 'local';
    return appEnv !== 'staging' && appEnv !== 'production';
  }

  protected override async getTracker(req: ClientIpRequest): Promise<string> {
    const appEnv = this.config.get<string>('APP_ENV') ?? 'local';
    const clientIp = getClientIp(req, appEnv);
    // M17-S27 verification (PR #167 review, 2026-07-19): staging has no Cloudflare/ALB in
    // front, so getClientIp() parses the raw X-Forwarded-For header itself (rightmost hop) —
    // unlike production, which trusts CF-Connecting-IP. Which hop is actually the client was
    // never confirmed against real Cloud Run traffic (see client-ip.ts). Left in permanently,
    // staging-only, debug-level: cheap enough to keep for any future re-verification if
    // staging's front-end topology ever changes again.
    if (appEnv === 'staging') {
      this.logger.debug(
        `xff-verify: x-forwarded-for="${req.headers['x-forwarded-for']}" resolved="${clientIp}"`,
      );
    }
    return clientIp;
  }

  protected override async throwThrottlingException(): Promise<void> {
    throw throwProblemDetail(
      429,
      AuthErrorCode.RATE_LIMITED,
      'Muitas requisições. Tente novamente em instantes.',
    );
  }
}
