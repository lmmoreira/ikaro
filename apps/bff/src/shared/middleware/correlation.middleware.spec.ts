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

  it('reuses an existing x-correlation-id header instead of generating one', () => {
    const middleware = new CorrelationMiddleware();
    const { req, res, next, setHeader } = makeReqRes({
      'x-correlation-id': 'incoming-correlation-id',
    });

    middleware.use(req, res, next);

    expect(req.headers['x-correlation-id']).toBe('incoming-correlation-id');
    expect(setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'incoming-correlation-id');
    expect(next).toHaveBeenCalled();
  });
});
