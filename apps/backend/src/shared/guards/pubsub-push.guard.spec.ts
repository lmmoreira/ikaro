import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PubSubPushGuard } from './pubsub-push.guard';
import { IOidcTokenVerifier, OidcTokenPayload } from '../ports/oidc-token-verifier.port';

const AUDIENCE = 'https://backend.internal/pubsub/push';
const EXPECTED_EMAIL = 'ikaro-pubsub-invoker@project.iam.gserviceaccount.com';
const GOOGLE_ISSUER = 'https://accounts.google.com';

function makeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    APP_ENV: 'production',
    PUBSUB_PUSH_AUDIENCE: AUDIENCE,
    PUBSUB_PUSH_SERVICE_ACCOUNT: EXPECTED_EMAIL,
    ...overrides,
  };
  return {
    get: (key: string, defaultValue?: unknown): unknown => values[key] ?? defaultValue,
    getOrThrow: (key: string): unknown => {
      if (values[key] === undefined) throw new Error(`Missing config: ${key}`);
      return values[key];
    },
  } as unknown as ConfigService;
}

function makeVerifier(result: OidcTokenPayload | Error): IOidcTokenVerifier {
  return {
    verify: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

const makeContext = (authorization?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authorization ? { authorization } : {},
      }),
    }),
  }) as unknown as ExecutionContext;

const validPayload: OidcTokenPayload = {
  iss: GOOGLE_ISSUER,
  email: EXPECTED_EMAIL,
  email_verified: true,
};

describe('PubSubPushGuard', () => {
  it('allows a request with a valid token', async () => {
    const guard = new PubSubPushGuard(makeConfigService(), makeVerifier(validPayload));
    await expect(guard.canActivate(makeContext('Bearer valid-token'))).resolves.toBe(true);
  });

  it('rejects when the Authorization header is missing', async () => {
    const guard = new PubSubPushGuard(makeConfigService(), makeVerifier(validPayload));
    await expect(guard.canActivate(makeContext())).rejects.toThrow(HttpException);
  });

  it('rejects when the token fails signature/expiry verification', async () => {
    const guard = new PubSubPushGuard(
      makeConfigService(),
      makeVerifier(new Error('Token used too late')),
    );
    await expect(guard.canActivate(makeContext('Bearer expired-token'))).rejects.toThrow(
      HttpException,
    );
  });

  it('rejects a token with the wrong issuer', async () => {
    const guard = new PubSubPushGuard(
      makeConfigService(),
      makeVerifier({ ...validPayload, iss: 'https://evil.example' }),
    );
    await expect(guard.canActivate(makeContext('Bearer token'))).rejects.toThrow(HttpException);
  });

  it('rejects a token with the wrong service-account email', async () => {
    const guard = new PubSubPushGuard(
      makeConfigService(),
      makeVerifier({ ...validPayload, email: 'someone-else@project.iam.gserviceaccount.com' }),
    );
    await expect(guard.canActivate(makeContext('Bearer token'))).rejects.toThrow(HttpException);
  });

  it('rejects a token whose email is not verified', async () => {
    const guard = new PubSubPushGuard(
      makeConfigService(),
      makeVerifier({ ...validPayload, email_verified: false }),
    );
    await expect(guard.canActivate(makeContext('Bearer token'))).rejects.toThrow(HttpException);
  });

  it('responds with a 403 Problem Detail body', async () => {
    const guard = new PubSubPushGuard(makeConfigService(), makeVerifier(validPayload));
    try {
      await guard.canActivate(makeContext());
      fail('expected HttpException');
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(403);
      const body = exception.getResponse() as Record<string, unknown>;
      expect(body['type']).toBe('about:blank');
      expect(body['status']).toBe(403);
    }
  });

  it('bypasses verification entirely when APP_ENV=local', async () => {
    const guard = new PubSubPushGuard(
      makeConfigService({ APP_ENV: 'local' }),
      makeVerifier(new Error('should never be called')),
    );
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('enforces in staging just like production', async () => {
    const guard = new PubSubPushGuard(
      makeConfigService({ APP_ENV: 'staging' }),
      makeVerifier(validPayload),
    );
    await expect(guard.canActivate(makeContext())).rejects.toThrow(HttpException);
    await expect(guard.canActivate(makeContext('Bearer valid-token'))).resolves.toBe(true);
  });
});
