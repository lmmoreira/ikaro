import { HttpException, HttpStatus } from '@nestjs/common';
import { CallHandler } from '@nestjs/common';
import { lastValueFrom, Observable, of, throwError } from 'rxjs';
import { AuthErrorCode } from '@ikaro/types';
import { makeExecutionContext } from '../../test/execution-context.factory';
import { AppLogger } from '../observability/app-logger';
import { ErrorInterceptor } from './error.interceptor';

function makeHandler(observable: Observable<unknown>): CallHandler {
  return { handle: () => observable } as unknown as CallHandler;
}

describe('ErrorInterceptor', () => {
  let interceptor: ErrorInterceptor;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new ErrorInterceptor();
    loggerErrorSpy = jest.spyOn(AppLogger.prototype, 'error').mockImplementation(() => undefined);
    loggerWarnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('passes through an HttpException with no code, without logging', async () => {
    const httpErr = new HttpException({ title: 'Not Found', status: 404 }, 404);
    const result$ = interceptor.intercept(
      makeExecutionContext({ path: '/v1/test' }),
      makeHandler(throwError(() => httpErr)),
    );

    await expect(lastValueFrom(result$)).rejects.toBe(httpErr);
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('logs a warning with the code for a 4xx HttpException carrying a code', async () => {
    const httpErr = new HttpException(
      { title: 'Forbidden', status: 403, code: AuthErrorCode.FORBIDDEN },
      403,
    );
    const result$ = interceptor.intercept(
      makeExecutionContext({ path: '/v1/staff', method: 'PATCH' }),
      makeHandler(throwError(() => httpErr)),
    );

    await expect(lastValueFrom(result$)).rejects.toBe(httpErr);
    expect(loggerWarnSpy).toHaveBeenCalledWith('Error response', {
      code: AuthErrorCode.FORBIDDEN,
      path: '/v1/staff',
      method: 'PATCH',
    });
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('logs an error with the code for a 5xx HttpException carrying a code', async () => {
    const httpErr = new HttpException(
      { title: 'Bad Gateway', status: 502, code: 'BFF_UPSTREAM_UNAVAILABLE' },
      502,
    );
    const result$ = interceptor.intercept(
      makeExecutionContext({ path: '/v1/bookings' }),
      makeHandler(throwError(() => httpErr)),
    );

    await expect(lastValueFrom(result$)).rejects.toBe(httpErr);
    expect(loggerErrorSpy).toHaveBeenCalledWith('Error response', undefined, {
      code: 'BFF_UPSTREAM_UNAVAILABLE',
      path: '/v1/bookings',
      method: 'GET',
    });
  });

  it('converts unknown errors to 500 with RFC 7807 body', async () => {
    const result$ = interceptor.intercept(
      makeExecutionContext({ path: '/v1/staff' }),
      makeHandler(throwError(() => new Error('database down'))),
    );

    await expect(lastValueFrom(result$)).rejects.toMatchObject({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      response: expect.objectContaining({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        code: AuthErrorCode.INTERNAL_ERROR,
        instance: '/v1/staff',
      }),
    });
  });

  it('logs the error message, stack, and code for unknown errors', async () => {
    const err = new Error('something went wrong');
    interceptor
      .intercept(
        makeExecutionContext({ path: '/v1/staff', method: 'POST' }),
        makeHandler(throwError(() => err)),
      )
      .subscribe({ error: () => undefined });

    expect(loggerErrorSpy).toHaveBeenCalledWith('Unhandled exception', err.stack, {
      code: AuthErrorCode.INTERNAL_ERROR,
      path: '/v1/staff',
      method: 'POST',
    });
  });

  it('logs stringified non-Error throws', async () => {
    interceptor
      .intercept(
        makeExecutionContext({ path: '/v1/test' }),
        makeHandler(throwError(() => 'string error')),
      )
      .subscribe({ error: () => undefined });

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Unhandled exception',
      'string error',
      expect.objectContaining({ code: AuthErrorCode.INTERNAL_ERROR }),
    );
  });

  it('passes through successful responses unchanged', async () => {
    const payload = { ok: true };
    const result$ = interceptor.intercept(
      makeExecutionContext({ path: '/v1/test' }),
      makeHandler(of(payload)),
    );
    await expect(lastValueFrom(result$)).resolves.toBe(payload);
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });
});
