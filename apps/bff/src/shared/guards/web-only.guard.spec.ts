import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { WebOnlyGuard } from './web-only.guard';

const TEST_KEY = 'a'.repeat(32);

const configService = {
  getOrThrow: (key: string): string => {
    if (key === 'WEB_INTERNAL_KEY') return TEST_KEY;
    throw new Error(`Unknown config key: ${key}`);
  },
} as unknown as ConfigService;

function makeReflector(bypass: boolean): Reflector {
  return { getAllAndOverride: () => bypass } as unknown as Reflector;
}

const makeContext = (webInternalKey?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: webInternalKey ? { 'x-web-internal-key': webInternalKey } : {},
      }),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('WebOnlyGuard', () => {
  let guard: WebOnlyGuard;

  beforeEach(() => {
    guard = new WebOnlyGuard(configService, makeReflector(false));
  });

  it('allows a route marked @BypassWebOnlyGuard() without any key (Cloud Run health probes)', () => {
    const bypassGuard = new WebOnlyGuard(configService, makeReflector(true));
    expect(bypassGuard.canActivate(makeContext())).toBe(true);
  });

  it('returns true for a valid X-Web-Internal-Key', () => {
    expect(guard.canActivate(makeContext(TEST_KEY))).toBe(true);
  });

  it('throws 401 when X-Web-Internal-Key header is absent — no @Public() escape hatch exists', () => {
    expect(() => guard.canActivate(makeContext())).toThrow(HttpException);
  });

  it('throws 401 for a wrong key', () => {
    expect(() => guard.canActivate(makeContext('wrong-key-wrong-key-wrong-key-xx'))).toThrow(
      HttpException,
    );
  });

  it('throws 401 with an RFC 9457 body for a non-matching key', () => {
    try {
      guard.canActivate(makeContext('wrong-key-wrong-key-wrong-key-xx'));
      fail('expected HttpException');
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(401);
      const body = (e as HttpException).getResponse() as Record<string, unknown>;
      expect(body['type']).toBe('about:blank');
      expect(body['title']).toBe('Unauthorized');
      expect(body['status']).toBe(401);
    }
  });

  it('accepts a key of different length without throwing — hash normalisation prevents length errors', () => {
    // timingSafeEqual requires equal-length buffers; hashing both sides guarantees this.
    // A short or long incoming key must not crash — it should just fail auth.
    expect(() => guard.canActivate(makeContext('short'))).toThrow(HttpException);
    expect(() => guard.canActivate(makeContext('x'.repeat(64)))).toThrow(HttpException);
  });
});
