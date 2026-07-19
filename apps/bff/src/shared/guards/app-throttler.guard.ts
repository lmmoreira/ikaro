import { ExecutionContext, Injectable } from '@nestjs/common';
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
    return getClientIp(req, appEnv);
  }

  protected override async throwThrottlingException(): Promise<void> {
    throw throwProblemDetail(
      429,
      AuthErrorCode.RATE_LIMITED,
      'Muitas requisições. Tente novamente em instantes.',
    );
  }
}
