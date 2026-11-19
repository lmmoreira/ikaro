import * as crypto from 'node:crypto';
import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthErrorCode } from '@ikaro/types';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { Public } from '../../shared/decorators/public.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { throwProblemDetail } from '../../shared/http/problem-detail';
import { ProviderWebhookBody, ProviderWebhookBodySchema } from './billing.webhook.schemas';

const ASAAS_TOKEN_HEADER = 'asaas-access-token';

/**
 * Timing-safe comparison: both sides are hashed first so the lengths match, the same construction
 * as `WebOnlyGuard`. An unset expected token never matches (fail closed): until the Asaas account
 * exists (M26-S39) nothing is registered at Asaas, so no delivery is expected.
 */
function tokenMatches(expected: string | undefined, received: string | undefined): boolean {
  if (!expected || !received) return false;
  const digest = (value: string): Buffer => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(expected), digest(received));
}

// The provider's webhook receiver (UC-114). Public and provider-called, so it is its own controller
// beside the authenticated `billing.controller.ts`. Asaas reaches it through the `ikaro-web`
// same-origin gateway, which attaches the shared-secret header itself, so the web-only guard needs
// no bypass; the gateway resolves every Asaas delivery to one client IP, so `@SkipThrottle()` is
// mandatory (a retry storm must never meet a per-IP 429). The BFF carries no tenant-access
// annotation (M25-S33): the backend route declares its own. Asaas counts every 2xx other than
// `200` as a failure, so `@HttpCode(200)` is not optional (Nest answers 201 for a POST).
@Controller('public/billing/webhooks')
export class BillingWebhookPublicController {
  constructor(
    private readonly backend: BackendHttpService,
    private readonly config: ConfigService,
  ) {}

  // Authenticity is checked here and only here: the backend never sees the token. A wrong or
  // missing token answers 401 and nothing reaches the backend. A backend failure is forwarded as
  // non-2xx on purpose, so the provider retries.
  @Public()
  @SkipThrottle()
  @Post('asaas')
  @HttpCode(HttpStatus.OK)
  async receiveAsaas(
    @Headers(ASAAS_TOKEN_HEADER) token: string | undefined,
    @Body(new ZodValidationPipe(ProviderWebhookBodySchema)) body: ProviderWebhookBody,
  ): Promise<void> {
    if (!tokenMatches(this.config.get<string>('ASAAS_WEBHOOK_TOKEN'), token)) {
      throw throwProblemDetail(
        HttpStatus.UNAUTHORIZED,
        AuthErrorCode.UNAUTHORIZED,
        'Missing or invalid webhook token',
      );
    }
    await this.backend.postWithoutTenant<void>('/internal/billing/webhooks/asaas', body);
  }
}
