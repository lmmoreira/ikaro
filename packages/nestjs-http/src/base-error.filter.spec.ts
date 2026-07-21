import { ArgumentsHost, HttpException } from '@nestjs/common';
import { AuthErrorCode } from '@ikaro/types';
import type { BaseAppLogger, ITracingPort, SpanAttributeValue } from '@ikaro/observability';
import { BaseErrorFilter } from './base-error.filter';

class TestErrorFilter extends BaseErrorFilter {
  constructor(logger: BaseAppLogger, tracingPort?: ITracingPort) {
    super(logger, tracingPort);
  }
}

class FakeTracingPort implements ITracingPort {
  readonly calls: Array<Record<string, SpanAttributeValue>> = [];
  setActiveSpanAttributes(attributes: Record<string, SpanAttributeValue>): void {
    this.calls.push(attributes);
  }
  getActiveTraceContext(): undefined {
    return undefined;
  }
  injectContext(): void {
    /* unused by this suite */
  }
  runWithExtractedContext<T>(_carrier: Record<string, string>, fn: () => T): T {
    return fn();
  }
  startActiveSpan<T>(_name: string, fn: () => T): T {
    return fn();
  }
}

function makeLogger(): { warn: jest.Mock; error: jest.Mock } {
  return { warn: jest.fn(), error: jest.fn() };
}

function makeHost(
  path: string,
  method = 'GET',
  headers: Record<string, string | string[] | undefined> = {},
) {
  const json = jest.fn();
  const set = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ path, method, headers }),
      getResponse: () => ({ status, set }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json, set };
}

describe('BaseErrorFilter', () => {
  let logger: ReturnType<typeof makeLogger>;
  let tracingPort: FakeTracingPort;
  let filter: TestErrorFilter;

  beforeEach(() => {
    logger = makeLogger();
    tracingPort = new FakeTracingPort();
    filter = new TestErrorFilter(logger as unknown as BaseAppLogger, tracingPort);
  });

  it('sets Content-Type: application/problem+json on every response (RFC 9457)', () => {
    const httpErr = new HttpException(
      { type: 'about:blank', title: 'Not Found', status: 404 },
      404,
    );
    const { host, set } = makeHost('/v1/bookings/unknown');

    filter.catch(httpErr, host);

    expect(set).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
  });

  it('writes an already-canonical HttpException body as-is, without logging', () => {
    const body = { type: 'about:blank', title: 'Not Found', status: 404 };
    const httpErr = new HttpException(body, 404);
    const { host, status, json } = makeHost('/v1/bookings/unknown');

    filter.catch(httpErr, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(body);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs a warning with the code for a 4xx HttpException carrying a code, and writes it unchanged', () => {
    const body = {
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      code: 'BOOKING_PICKUP_ADDRESS_REQUIRED',
    };
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
    expect(tracingPort.calls).toEqual([{ 'error.code': 'BOOKING_PICKUP_ADDRESS_REQUIRED' }]);
  });

  it('logs an error with the code for a 5xx HttpException carrying a code, and writes it unchanged', () => {
    const body = {
      type: 'about:blank',
      title: 'Bad Gateway',
      status: 502,
      code: 'BFF_UPSTREAM_UNAVAILABLE',
    };
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
    expect(tracingPort.calls).toEqual([{ 'error.code': 'BFF_UPSTREAM_UNAVAILABLE' }]);
  });

  it('does not touch the tracing port when the HttpException body carries no code', () => {
    const body = { type: 'about:blank', title: 'Not Found', status: 404 };
    const httpErr = new HttpException(body, 404);
    const { host } = makeHost('/v1/bookings/unknown');

    filter.catch(httpErr, host);

    expect(tracingPort.calls).toEqual([]);
  });

  it('catches an exception thrown by a guard the same way as one thrown by a controller', () => {
    // Regression test for the interceptor-based design's blind spot: Guards run before
    // Interceptors in NestJS's pipeline, so an interceptor-based catchError never saw a
    // guard's HttpException. A filter (@Catch()) has no such ordering gap — this test just
    // asserts the filter handles a guard-shaped 403 identically to any other HttpException.
    const body = {
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
      code: AuthErrorCode.FORBIDDEN,
    };
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

  it('attaches correlationId (header + body) to a guard-thrown HttpException when present on the request', () => {
    // The request header is only present here because it was generated in middleware,
    // which runs before Guards — the same guard-rejection scenario as the test above,
    // now proving the id that middleware set actually reaches the response.
    const body = {
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      code: AuthErrorCode.UNAUTHORIZED,
    };
    const httpErr = new HttpException(body, 401);
    const { host, json, set } = makeHost('/v1/staff', 'GET', {
      'x-correlation-id': 'corr-guard-rejected-123',
    });

    filter.catch(httpErr, host);

    expect(set).toHaveBeenCalledWith('X-Correlation-ID', 'corr-guard-rejected-123');
    expect(json).toHaveBeenCalledWith({ ...body, correlationId: 'corr-guard-rejected-123' });
  });

  it('omits correlationId from the body and skips the header when the request carries none', () => {
    const body = { type: 'about:blank', title: 'Not Found', status: 404 };
    const httpErr = new HttpException(body, 404);
    const { host, json, set } = makeHost('/v1/bookings/unknown');

    filter.catch(httpErr, host);

    expect(json).toHaveBeenCalledWith(body);
    expect(set).not.toHaveBeenCalledWith('X-Correlation-ID', expect.anything());
  });

  describe('non-canonical HttpException bodies (framework-thrown, not throwProblemDetail())', () => {
    it("normalizes Nest's default { statusCode, message, error } shape into a real ProblemDetail", () => {
      // This is exactly the shape of Nest's own router-level 404 for an unmatched route —
      // never constructed via throwProblemDetail()/buildProblemDetail(), so it never had
      // { type, title, status } to begin with. Passing it through unchanged while also
      // stamping Content-Type: application/problem+json on it would mislabel a
      // non-compliant body as compliant.
      const httpErr = new HttpException(
        { statusCode: 404, message: 'Cannot GET /v1/unknown-route', error: 'Not Found' },
        404,
      );
      const { host, status, json } = makeHost('/v1/unknown-route');

      filter.catch(httpErr, host);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: 'Cannot GET /v1/unknown-route',
      });
    });

    it('still attaches correlationId to a normalized body', () => {
      const httpErr = new HttpException(
        { statusCode: 404, message: 'Cannot GET /v1/unknown-route', error: 'Not Found' },
        404,
      );
      const { host, json } = makeHost('/v1/unknown-route', 'GET', {
        'x-correlation-id': 'corr-unmatched-route',
      });

      filter.catch(httpErr, host);

      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: 'corr-unmatched-route' }),
      );
    });

    it('falls back to exception.message when the raw body has no string message field', () => {
      const httpErr = new HttpException('Forbidden resource', 403);
      const { host, json } = makeHost('/v1/staff');

      filter.catch(httpErr, host);

      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'about:blank', status: 403, detail: 'Forbidden resource' }),
      );
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

  it('attaches correlationId to an unhandled 500 ProblemDetail when present on the request', () => {
    const { host, json } = makeHost('/v1/bookings', 'GET', {
      'x-correlation-id': 'corr-unhandled-500',
    });

    filter.catch(new Error('database down'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'corr-unhandled-500' }),
    );
  });

  it('never includes a stack trace in the response body for an unhandled error, in any NODE_ENV', () => {
    // Stack goes to the logger only (asserted below) — the response body is built as a
    // literal object with a fixed set of keys, so there is no code path that could leak
    // exception.stack into it. This holds unconditionally, not just when
    // NODE_ENV=production, which is the point: no env-conditional branch to get wrong.
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { host, json } = makeHost('/v1/bookings');

      filter.catch(new Error('database down\n    at someInternalFn (/app/dist/x.js:42:1)'), host);

      const [body] = json.mock.calls[0] as [Record<string, unknown>];
      expect(Object.keys(body).sort()).toEqual(
        ['code', 'detail', 'instance', 'status', 'title', 'type'].sort(),
      );
      expect(JSON.stringify(body)).not.toContain('someInternalFn');
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
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
    expect(tracingPort.calls).toEqual([{ 'error.code': AuthErrorCode.INTERNAL_ERROR }]);
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
