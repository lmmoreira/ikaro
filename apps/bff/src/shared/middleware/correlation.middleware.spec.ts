import { NextFunction, Request, Response } from 'express';
import { CorrelationMiddleware } from './correlation.middleware';

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
});
