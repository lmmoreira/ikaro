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

  describe('shouldSkip()', () => {
    it.each<[string | undefined, boolean]>([
      ['production', false],
      ['staging', false],
      // Local's default when APP_ENV is unset — covers CI/E2E too, since nothing sets it there.
      [undefined, true],
      ['local', true],
    ])('APP_ENV=%s -> skip=%s', async (appEnv, expectedSkip) => {
      guard = makeGuard(appEnv);
      const skip = await (
        guard as unknown as { shouldSkip: (context: unknown) => Promise<boolean> }
      ).shouldSkip({});
      expect(skip).toBe(expectedSkip);
    });
  });

  describe('getTracker() (TD38: trusts ikaro-web-forwarded X-Real-Client-Ip)', () => {
    it('resolves the client IP via X-Real-Client-Ip, regardless of APP_ENV', async () => {
      guard = makeGuard('production');
      const tracker = await (
        guard as unknown as { getTracker: (req: unknown) => Promise<string> }
      ).getTracker({ headers: { 'x-real-client-ip': '203.0.113.10' }, ip: '10.0.0.1' });
      expect(tracker).toBe('203.0.113.10');
    });

    it('ignores X-Forwarded-For entirely — meaningless post-TD38 lockdown', async () => {
      guard = makeGuard('staging');
      const tracker = await (
        guard as unknown as { getTracker: (req: unknown) => Promise<string> }
      ).getTracker({
        headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.99' },
        ip: '10.0.0.1',
      });
      expect(tracker).toBe('10.0.0.1');
    });

    it('falls back to req.ip when the header is genuinely absent (e.g. local dev, no gateway)', async () => {
      guard = makeGuard(undefined);
      const tracker = await (
        guard as unknown as { getTracker: (req: unknown) => Promise<string> }
      ).getTracker({ headers: {}, ip: '127.0.0.1' });
      expect(tracker).toBe('127.0.0.1');
    });

    it('debug-logs the X-Real-Client-Ip header and resolved IP', async () => {
      guard = makeGuard('staging');
      const logger = (guard as unknown as { logger: { debug: jest.Mock } }).logger;
      const debugSpy = jest.spyOn(logger, 'debug');
      await (guard as unknown as { getTracker: (req: unknown) => Promise<string> }).getTracker({
        headers: { 'x-real-client-ip': '203.0.113.99' },
        ip: '10.0.0.1',
      });
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('x-real-client-ip="203.0.113.99" resolved="203.0.113.99"'),
      );
    });

    it('still calls debug() unconditionally in production (AppLogger/LOG_LEVEL filters it, not this guard)', async () => {
      guard = makeGuard('production');
      const logger = (guard as unknown as { logger: { debug: jest.Mock } }).logger;
      const debugSpy = jest.spyOn(logger, 'debug');
      await (guard as unknown as { getTracker: (req: unknown) => Promise<string> }).getTracker({
        headers: { 'x-real-client-ip': '203.0.113.10' },
        ip: '10.0.0.1',
      });
      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('resolved="203.0.113.10"'));
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
