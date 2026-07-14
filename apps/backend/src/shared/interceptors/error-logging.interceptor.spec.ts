import { CallHandler, ExecutionContext, HttpException } from '@nestjs/common';
import { lastValueFrom, Observable, of, throwError } from 'rxjs';
import { AppLogger } from '../observability/app-logger';
import { ErrorLoggingInterceptor } from './error-logging.interceptor';

function makeContext(path: string, method = 'GET'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ path, method }),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(observable: Observable<unknown>): CallHandler {
  return { handle: () => observable } as unknown as CallHandler;
}

describe('ErrorLoggingInterceptor', () => {
  let interceptor: ErrorLoggingInterceptor;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new ErrorLoggingInterceptor();
    loggerErrorSpy = jest.spyOn(AppLogger.prototype, 'error').mockImplementation(() => undefined);
    loggerWarnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('passes through an HttpException with no code, without logging', async () => {
    const httpErr = new HttpException({ title: 'Not Found', status: 404 }, 404);
    const result$ = interceptor.intercept(
      makeContext('/v1/bookings/unknown'),
      makeHandler(throwError(() => httpErr)),
    );

    await expect(lastValueFrom(result$)).rejects.toBe(httpErr);
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('logs a warning with the code for a 4xx HttpException carrying a code', async () => {
    const httpErr = new HttpException(
      { title: 'Bad Request', status: 400, code: 'BOOKING_PICKUP_ADDRESS_REQUIRED' },
      400,
    );
    const result$ = interceptor.intercept(
      makeContext('/v1/bookings', 'POST'),
      makeHandler(throwError(() => httpErr)),
    );

    await expect(lastValueFrom(result$)).rejects.toBe(httpErr);
    expect(loggerWarnSpy).toHaveBeenCalledWith('Error response', {
      code: 'BOOKING_PICKUP_ADDRESS_REQUIRED',
      path: '/v1/bookings',
      method: 'POST',
    });
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('logs an error with the code for a 5xx HttpException carrying a code', async () => {
    const httpErr = new HttpException(
      { title: 'Internal Server Error', status: 500, code: 'INTERNAL_ERROR' },
      500,
    );
    const result$ = interceptor.intercept(
      makeContext('/v1/staff'),
      makeHandler(throwError(() => httpErr)),
    );

    await expect(lastValueFrom(result$)).rejects.toBe(httpErr);
    expect(loggerErrorSpy).toHaveBeenCalledWith('Error response', undefined, {
      code: 'INTERNAL_ERROR',
      path: '/v1/staff',
      method: 'GET',
    });
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('does not log or interfere with non-HttpException errors', async () => {
    const err = new Error('unexpected');
    const result$ = interceptor.intercept(
      makeContext('/v1/bookings'),
      makeHandler(throwError(() => err)),
    );

    await expect(lastValueFrom(result$)).rejects.toBe(err);
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('passes through successful responses unchanged', async () => {
    const payload = { ok: true };
    const result$ = interceptor.intercept(makeContext('/v1/bookings'), makeHandler(of(payload)));

    await expect(lastValueFrom(result$)).resolves.toBe(payload);
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });
});
