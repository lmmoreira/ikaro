import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebOnlyGuard } from './web-only.guard';

const TEST_KEY = 'a'.repeat(32);

const configService = {
  getOrThrow: (key: string): string => {
    if (key === 'WEB_INTERNAL_KEY') return TEST_KEY;
    throw new Error(`Unknown config key: ${key}`);
  },
} as unknown as ConfigService;

const makeContext = (webInternalKey?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: webInternalKey ? { 'x-web-internal-key': webInternalKey } : {},
      }),
    }),
  }) as unknown as ExecutionContext;

describe('WebOnlyGuard', () => {
  let guard: WebOnlyGuard;

  beforeEach(() => {
    guard = new WebOnlyGuard(configService);
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
