import { Injectable } from '@nestjs/common';
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

// Overrides the two extension points ThrottlerGuard exists to be extended through (M17-S30):
// getTracker keys the limit on the correctly-resolved client IP (never the raw socket peer,
// which is Cloudflare/the ALB/Cloud Run's front end in every real environment — see
// shared/http/client-ip.ts), and throwThrottlingException converts the library's default,
// non-RFC-9457 429 body into this app's standard Problem Detail envelope.
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
