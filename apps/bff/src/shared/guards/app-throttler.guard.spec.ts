import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { HttpException } from '@nestjs/common';
import { AuthErrorCode, SignupErrorCode } from '@ikaro/types';
import { THROTTLE_ERROR_CODE_KEY } from '../decorators/throttle-error-code.decorator';
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
      const logger = (guard as unknown as { appLogger: { debug: jest.Mock } }).appLogger;
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
      const logger = (guard as unknown as { appLogger: { debug: jest.Mock } }).appLogger;
      const debugSpy = jest.spyOn(logger, 'debug');
      await (guard as unknown as { getTracker: (req: unknown) => Promise<string> }).getTracker({
        headers: { 'x-real-client-ip': '203.0.113.10' },
        ip: '10.0.0.1',
      });
      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('resolved="203.0.113.10"'));
    });
  });

  describe('throwThrottlingException()', () => {
    type Thrower = (context: unknown, detail: unknown) => Promise<void>;

    function contextFor(handler: () => void): { context: unknown; setHeader: jest.Mock } {
      const setHeader = jest.fn();
      const context = {
        getHandler: () => handler,
        getClass: () => class Controller {},
        switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
      };
      return { context, setHeader };
    }

    const detail = (overrides: Record<string, unknown> = {}) => ({
      isBlocked: false,
      timeToExpire: 41.2,
      timeToBlockExpire: 0,
      ...overrides,
    });

    async function thrown(guard: AppThrottlerGuard, context: unknown, d: unknown) {
      return (await (guard as unknown as { throwThrottlingException: Thrower })
        .throwThrottlingException(context, d)
        .catch((e: unknown) => e)) as HttpException;
    }

    it('throws a 429 Problem Detail with AuthErrorCode.RATE_LIMITED by default', async () => {
      guard = makeGuard('production');
      const { context } = contextFor(() => undefined);

      const error = await thrown(guard, context, detail());

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(429);
      const body = error.getResponse() as Record<string, unknown>;
      expect(body['code']).toBe(AuthErrorCode.RATE_LIMITED);
      expect(body['status']).toBe(429);
    });

    it('sets Retry-After to the seconds left, rounded up', async () => {
      guard = makeGuard('production');
      const { context, setHeader } = contextFor(() => undefined);

      await thrown(guard, context, detail({ timeToExpire: 41.2 }));

      expect(setHeader).toHaveBeenCalledWith('Retry-After', '42');
    });

    it('waits out the block for a blocked client, and never advertises less than 1 second', async () => {
      guard = makeGuard('production');
      const blocked = contextFor(() => undefined);
      const nearZero = contextFor(() => undefined);

      await thrown(guard, blocked.context, detail({ isBlocked: true, timeToBlockExpire: 300 }));
      await thrown(guard, nearZero.context, detail({ timeToExpire: 0 }));

      expect(blocked.setHeader).toHaveBeenCalledWith('Retry-After', '300');
      expect(nearZero.setHeader).toHaveBeenCalledWith('Retry-After', '1');
    });

    it("answers the route's own code when it declares one with @ThrottleErrorCode", async () => {
      guard = makeGuard('production');
      const handler = function signupHandler() {
        /* decorated below */
      };
      Reflect.defineMetadata(THROTTLE_ERROR_CODE_KEY, SignupErrorCode.RATE_LIMITED, handler);
      const { context } = contextFor(handler);

      const error = await thrown(guard, context, detail());

      expect((error.getResponse() as Record<string, unknown>)['code']).toBe(
        SignupErrorCode.RATE_LIMITED,
      );
      expect(error.getStatus()).toBe(429);
    });
  });
});
