import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { HttpException } from '@nestjs/common';
import { AuthErrorCode } from '@ikaro/types';
import { AppThrottlerGuard } from './app-throttler.guard';

describe('AppThrottlerGuard', () => {
  let guard: AppThrottlerGuard;
  let config: ConfigService;

  function makeGuard(appEnv: string | undefined): AppThrottlerGuard {
    config = { get: jest.fn().mockReturnValue(appEnv) } as unknown as ConfigService;
    const options = [{ ttl: 60000, limit: 60 }] as unknown as ThrottlerModuleOptions;
    const storageService = {} as unknown as ThrottlerStorage;
    const reflector = new Reflector();
    return new AppThrottlerGuard(options, storageService, reflector, config);
  }

  describe('getTracker()', () => {
    it('resolves the client IP via CF-Connecting-IP in production', async () => {
      guard = makeGuard('production');
      const tracker = await (
        guard as unknown as { getTracker: (req: unknown) => Promise<string> }
      ).getTracker({ headers: { 'cf-connecting-ip': '203.0.113.10' }, ip: '10.0.0.1' });
      expect(tracker).toBe('203.0.113.10');
    });

    it('resolves the client IP via the rightmost X-Forwarded-For hop in staging', async () => {
      guard = makeGuard('staging');
      const tracker = await (
        guard as unknown as { getTracker: (req: unknown) => Promise<string> }
      ).getTracker({
        headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.99' },
        ip: '10.0.0.1',
      });
      expect(tracker).toBe('203.0.113.99');
    });

    it('defaults to local (rightmost-XFF behavior) when APP_ENV is unset', async () => {
      guard = makeGuard(undefined);
      const tracker = await (
        guard as unknown as { getTracker: (req: unknown) => Promise<string> }
      ).getTracker({ headers: {}, ip: '127.0.0.1' });
      expect(tracker).toBe('127.0.0.1');
    });
  });

  describe('throwThrottlingException()', () => {
    it('throws a 429 Problem Detail with AuthErrorCode.RATE_LIMITED', async () => {
      guard = makeGuard('production');
      const call = (
        guard as unknown as { throwThrottlingException: () => Promise<void> }
      ).throwThrottlingException();

      await expect(call).rejects.toThrow(HttpException);
      try {
        await call;
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(429);
        const body = (e as HttpException).getResponse() as Record<string, unknown>;
        expect(body['code']).toBe(AuthErrorCode.RATE_LIMITED);
        expect(body['status']).toBe(429);
      }
    });
  });
});
