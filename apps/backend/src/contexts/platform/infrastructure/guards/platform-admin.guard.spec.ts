import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformAdminGuard } from './platform-admin.guard';

const TEST_KEY = 'a'.repeat(32);

const configService = {
  getOrThrow: (key: string): string => {
    if (key === 'PLATFORM_ADMIN_KEY') return TEST_KEY;
    throw new Error(`Unknown config key: ${key}`);
  },
} as unknown as ConfigService;

const makeContext = (headers: Record<string, string> = {}): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  }) as unknown as ExecutionContext;

describe('PlatformAdminGuard', () => {
  let guard: PlatformAdminGuard;

  beforeEach(() => {
    guard = new PlatformAdminGuard(configService);
  });

  it('returns true for a valid X-Platform-Admin-Key header', () => {
    expect(guard.canActivate(makeContext({ 'x-platform-admin-key': TEST_KEY }))).toBe(true);
  });

  it('throws 401 when X-Platform-Admin-Key header is absent', () => {
    expect(() => guard.canActivate(makeContext())).toThrow(HttpException);
  });

  it('throws 401 for a wrong key', () => {
    expect(() =>
      guard.canActivate(makeContext({ 'x-platform-admin-key': 'wrong-key-wrong-key-wrong-key' })),
    ).toThrow(HttpException);
  });

  it('throws 401 when the key is sent through Authorization', () => {
    expect(() => guard.canActivate(makeContext({ authorization: `Bearer ${TEST_KEY}` }))).toThrow(
      HttpException,
    );
  });

  it('accepts a key of different length without throwing — hash normalisation prevents length errors', () => {
    // timingSafeEqual requires equal-length buffers; hashing both sides guarantees this.
    // A short or long incoming token must not crash — it should just fail auth.
    expect(() => guard.canActivate(makeContext({ 'x-platform-admin-key': 'short' }))).toThrow(
      HttpException,
    );
    expect(() =>
      guard.canActivate(makeContext({ 'x-platform-admin-key': 'x'.repeat(64) })),
    ).toThrow(HttpException);
  });
});
