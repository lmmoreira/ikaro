import { ITracingPort, SpanAttributeValue } from '@ikaro/observability';
import { NextFunction, Request, Response } from 'express';
import { getRequestStore } from '../request/request-context';
import { CorrelationMiddleware } from './correlation.middleware';

// Records calls instead of talking to a real span — this is exactly the testability gap the
// ITracingPort refactor closes: previously trace.getActiveSpan()?.setAttribute(...) had no
// active span in a unit test, so the call silently no-op'd and nothing here could assert on it.
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

function makeReqRes(headers: Record<string, string> = {}): {
  req: Request;
  res: Response;
  next: NextFunction;
  setHeader: jest.Mock;
} {
  const setHeader = jest.fn();
  const req = { headers: { ...headers } } as unknown as Request;
  const res = { setHeader } as unknown as Response;
  const next = jest.fn() as unknown as NextFunction;
  return { req, res, next, setHeader };
}

describe('CorrelationMiddleware', () => {
  it('generates a UUIDv7 when x-correlation-id is absent, and echoes it on the response header', () => {
    const middleware = new CorrelationMiddleware();
    const { req, res, next, setHeader } = makeReqRes();

    middleware.use(req, res, next);

    expect(req.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(setHeader).toHaveBeenCalledWith('X-Correlation-ID', req.headers['x-correlation-id']);
    expect(next).toHaveBeenCalled();
  });

  it('reuses an existing x-correlation-id header when it is a well-formed UUIDv7', () => {
    const middleware = new CorrelationMiddleware();
    const validId = '01888888-0000-7000-8000-000000000001';
    const { req, res, next, setHeader } = makeReqRes({ 'x-correlation-id': validId });

    middleware.use(req, res, next);

    expect(req.headers['x-correlation-id']).toBe(validId);
    expect(setHeader).toHaveBeenCalledWith('X-Correlation-ID', validId);
    expect(next).toHaveBeenCalled();
  });

  it('replaces a non-UUID x-correlation-id with a freshly generated one, rather than trusting it', () => {
    // M17-S31 review (2026-07-20): an unvalidated client-supplied value would be reflected
    // into logs/traces, letting a caller poison trace searches or forge a fake correlation id.
    const middleware = new CorrelationMiddleware();
    const { req, res, next } = makeReqRes({ 'x-correlation-id': '<script>alert(1)</script>' });

    middleware.use(req, res, next);

    expect(req.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(req.headers['x-correlation-id']).not.toBe('<script>alert(1)</script>');
    expect(next).toHaveBeenCalled();
  });

  // Security review follow-up (2026-07-21): a guard-rejected request's error log previously
  // carried no correlationId at all, since RequestContext was only ever established by
  // RequestInterceptor (post-Guards) — this proves the middleware itself now establishes it,
  // pre-Guards, so any code running inside next() (including a Guard that rejects the request)
  // can already see correlationId.
  it('establishes RequestContext with correlationId before next() runs, so a guard-rejected request still has it', () => {
    const middleware = new CorrelationMiddleware();
    const { req, res, next: mockNext } = makeReqRes();

    let capturedCorrelationId: string | undefined;
    const next: NextFunction = () => {
      capturedCorrelationId = getRequestStore()?.correlationId;
      (mockNext as jest.Mock)();
    };

    middleware.use(req, res, next);

    expect(capturedCorrelationId).toBe(req.headers['x-correlation-id']);
    expect(mockNext).toHaveBeenCalled();
  });

  it('sets correlation.id on the active span via the tracing port', () => {
    const tracingPort = new FakeTracingPort();
    const middleware = new CorrelationMiddleware(tracingPort);
    const { req, res, next } = makeReqRes();

    middleware.use(req, res, next);

    expect(tracingPort.calls).toEqual([{ 'correlation.id': req.headers['x-correlation-id'] }]);
  });
});
