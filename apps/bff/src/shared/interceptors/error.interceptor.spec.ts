import { ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { CallHandler } from '@nestjs/common';
import { lastValueFrom, Observable, of, throwError } from 'rxjs';
import { ErrorInterceptor } from './error.interceptor';

function makeContext(path = '/v1/test', method = 'GET'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ path, method }),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(observable: Observable<unknown>): CallHandler {
  return { handle: () => observable } as unknown as CallHandler;
}

describe('ErrorInterceptor', () => {
  let interceptor: ErrorInterceptor;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new ErrorInterceptor();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('passes through HttpExceptions without logging', async () => {
    const httpErr = new HttpException({ title: 'Not Found', status: 404 }, 404);
    const result$ = interceptor.intercept(makeContext(), makeHandler(throwError(() => httpErr)));

    await expect(lastValueFrom(result$)).rejects.toBe(httpErr);
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('converts unknown errors to 500 with RFC 7807 body', async () => {
    const result$ = interceptor.intercept(
      makeContext('/v1/staff'),
      makeHandler(throwError(() => new Error('database down'))),
    );

    await expect(lastValueFrom(result$)).rejects.toMatchObject({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      response: expect.objectContaining({
        type: 'https://beloauto.com/errors/internal',
        title: 'Internal Server Error',
        status: 500,
        instance: '/v1/staff',
      }),
    });
  });

  it('logs the error message and stack for unknown errors', async () => {
    const err = new Error('something went wrong');
    interceptor
      .intercept(makeContext('/v1/staff', 'POST'), makeHandler(throwError(() => err)))
      .subscribe({ error: () => undefined });

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Unhandled exception',
      err.stack,
      expect.objectContaining({ path: '/v1/staff', method: 'POST' }),
    );
  });

  it('logs stringified non-Error throws', async () => {
    interceptor
      .intercept(makeContext(), makeHandler(throwError(() => 'string error')))
      .subscribe({ error: () => undefined });

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Unhandled exception',
      'string error',
      expect.any(Object),
    );
  });

  it('passes through successful responses unchanged', async () => {
    const payload = { ok: true };
    const result$ = interceptor.intercept(makeContext(), makeHandler(of(payload)));
    await expect(lastValueFrom(result$)).resolves.toBe(payload);
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });
});
