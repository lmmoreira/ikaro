import { ArgumentsHost, HttpException } from '@nestjs/common';
import { AuthErrorCode } from '@ikaro/types';
import type { BaseAppLogger } from '@ikaro/observability';
import { BaseErrorFilter } from './base-error.filter';

class TestErrorFilter extends BaseErrorFilter {
  constructor(logger: BaseAppLogger) {
    super(logger);
  }
}

function makeLogger(): { warn: jest.Mock; error: jest.Mock } {
  return { warn: jest.fn(), error: jest.fn() };
}

function makeHost(path: string, method = 'GET') {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ path, method }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('BaseErrorFilter', () => {
  let logger: ReturnType<typeof makeLogger>;
  let filter: TestErrorFilter;

  beforeEach(() => {
    logger = makeLogger();
    filter = new TestErrorFilter(logger as unknown as BaseAppLogger);
  });

  it('writes an HttpException with no code as-is, without logging', () => {
    const httpErr = new HttpException({ title: 'Not Found', status: 404 }, 404);
    const { host, status, json } = makeHost('/v1/bookings/unknown');

    filter.catch(httpErr, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ title: 'Not Found', status: 404 });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs a warning with the code for a 4xx HttpException carrying a code, and writes it unchanged', () => {
    const body = { title: 'Bad Request', status: 400, code: 'BOOKING_PICKUP_ADDRESS_REQUIRED' };
    const httpErr = new HttpException(body, 400);
    const { host, status, json } = makeHost('/v1/bookings', 'POST');

    filter.catch(httpErr, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(body);
    expect(logger.warn).toHaveBeenCalledWith('Error response', {
      code: 'BOOKING_PICKUP_ADDRESS_REQUIRED',
      path: '/v1/bookings',
      method: 'POST',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs an error with the code for a 5xx HttpException carrying a code, and writes it unchanged', () => {
    const body = { title: 'Bad Gateway', status: 502, code: 'BFF_UPSTREAM_UNAVAILABLE' };
    const httpErr = new HttpException(body, 502);
    const { host, status, json } = makeHost('/v1/staff');

    filter.catch(httpErr, host);

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith(body);
    expect(logger.error).toHaveBeenCalledWith('Error response', undefined, {
      code: 'BFF_UPSTREAM_UNAVAILABLE',
      path: '/v1/staff',
      method: 'GET',
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('catches an exception thrown by a guard the same way as one thrown by a controller', () => {
    // Regression test for the interceptor-based design's blind spot: Guards run before
    // Interceptors in NestJS's pipeline, so an interceptor-based catchError never saw a
    // guard's HttpException. A filter (@Catch()) has no such ordering gap — this test just
    // asserts the filter handles a guard-shaped 403 identically to any other HttpException.
    const body = { title: 'Forbidden', status: 403, code: AuthErrorCode.FORBIDDEN };
    const httpErr = new HttpException(body, 403);
    const { host, status, json } = makeHost('/v1/staff', 'PATCH');

    filter.catch(httpErr, host);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(body);
    expect(logger.warn).toHaveBeenCalledWith('Error response', {
      code: AuthErrorCode.FORBIDDEN,
      path: '/v1/staff',
      method: 'PATCH',
    });
  });

  it('converts an unhandled error to a 500 RFC 9457 ProblemDetail', () => {
    const { host, status, json } = makeHost('/v1/bookings');

    filter.catch(new Error('database down'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        code: AuthErrorCode.INTERNAL_ERROR,
        instance: '/v1/bookings',
      }),
    );
  });

  it('logs the error message, stack, and code for an unhandled error', () => {
    const err = new Error('something went wrong');
    const { host } = makeHost('/v1/staff', 'POST');

    filter.catch(err, host);

    expect(logger.error).toHaveBeenCalledWith('Unhandled exception', err.stack, {
      code: AuthErrorCode.INTERNAL_ERROR,
      path: '/v1/staff',
      method: 'POST',
    });
  });

  it('logs stringified non-Error throws', () => {
    const { host } = makeHost('/v1/bookings');

    filter.catch('string error', host);

    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled exception',
      'string error',
      expect.objectContaining({ code: AuthErrorCode.INTERNAL_ERROR }),
    );
  });
});
