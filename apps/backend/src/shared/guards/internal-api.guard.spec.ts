import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalApiGuard } from './internal-api.guard';

const TEST_KEY = 'a'.repeat(32);

const configService = {
  getOrThrow: (key: string): string => {
    if (key === 'INTERNAL_API_KEY') return TEST_KEY;
    throw new Error(`Unknown config key: ${key}`);
  },
} as unknown as ConfigService;

const makeContext = (internalKey?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: internalKey ? { 'x-internal-key': internalKey } : {},
      }),
    }),
  }) as unknown as ExecutionContext;

describe('InternalApiGuard', () => {
  let guard: InternalApiGuard;

  beforeEach(() => {
    guard = new InternalApiGuard(configService);
  });

  it('returns true for a valid X-Internal-Key', () => {
    expect(guard.canActivate(makeContext(TEST_KEY))).toBe(true);
  });

  it('throws 401 when X-Internal-Key header is absent', () => {
    expect(() => guard.canActivate(makeContext())).toThrow(UnauthorizedException);
  });

  it('throws 401 for a wrong key', () => {
    expect(() => guard.canActivate(makeContext('wrong-key-wrong-key-wrong-key-xx'))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws 401 for a non-matching key — RFC 9457 body is attached', () => {
    try {
      guard.canActivate(makeContext('wrong-key-wrong-key-wrong-key-xx'));
      fail('expected UnauthorizedException');
    } catch (e) {
      expect((e as UnauthorizedException).getStatus()).toBe(401);
      const body = (e as UnauthorizedException).getResponse() as Record<string, unknown>;
      expect(body['type']).toBe('about:blank');
      expect(body['title']).toBe('Unauthorized');
      expect(body['status']).toBe(401);
    }
  });

  it('accepts a key of different length without throwing — hash normalisation prevents length errors', () => {
    // timingSafeEqual requires equal-length buffers; hashing both sides guarantees this.
    // A short or long incoming key must not crash — it should just fail auth.
    expect(() => guard.canActivate(makeContext('short'))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(makeContext('x'.repeat(64)))).toThrow(UnauthorizedException);
  });
});
