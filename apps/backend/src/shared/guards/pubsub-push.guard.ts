import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../observability/app-logger';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { IOidcTokenVerifier, OIDC_TOKEN_VERIFIER } from '../ports/oidc-token-verifier.port';

const GOOGLE_ISSUER = 'https://accounts.google.com';
const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class PubSubPushGuard implements CanActivate {
  private readonly logger = new AppLogger(PubSubPushGuard.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(OIDC_TOKEN_VERIFIER) private readonly verifier: IOidcTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const appEnv = this.config.get<'local' | 'staging' | 'production'>('APP_ENV', 'local');
    // OIDC verification only makes sense against real deployed Pub/Sub push infra (staging/prod).
    const enforced = appEnv !== 'local';

    if (!enforced) {
      return true;
    }

    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith(BEARER_PREFIX)
      ? authHeader.slice(BEARER_PREFIX.length)
      : undefined;

    if (!token) {
      throw this.reject('Missing bearer token');
    }

    const audience = this.config.getOrThrow<string>('PUBSUB_PUSH_AUDIENCE');
    const expectedEmail = this.config.getOrThrow<string>('PUBSUB_PUSH_SERVICE_ACCOUNT');

    let payload: { iss?: string; email?: string; email_verified?: boolean };
    try {
      payload = await this.verifier.verify(token, audience);
    } catch (err) {
      this.logger.warn('[pubsub-push-guard] token verification failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw this.reject('Invalid OIDC token');
    }

    if (payload.iss !== GOOGLE_ISSUER) {
      throw this.reject('Unexpected token issuer');
    }
    if (!payload.email_verified || payload.email !== expectedEmail) {
      throw this.reject('Unexpected token subject');
    }

    return true;
  }

  private reject(detail: string): never {
    throw throwProblemDetail(HttpStatus.FORBIDDEN, undefined, detail);
  }
}
