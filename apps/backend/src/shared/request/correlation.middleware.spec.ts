import { NextFunction, Request, Response } from 'express';
import { CorrelationMiddleware } from './correlation.middleware';

function makeReqRes(headers: Record<string, string> = {}): {
  req: Request;
  res: Response;
  next: NextFunction;
} {
  const req = { headers: { ...headers } } as unknown as Request;
  const res = {} as Response;
  const next = jest.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe('CorrelationMiddleware', () => {
  it('generates a UUID when x-correlation-id is absent', () => {
    const middleware = new CorrelationMiddleware();
    const { req, res, next } = makeReqRes();

    middleware.use(req, res, next);

    expect(req.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(next).toHaveBeenCalled();
  });

  it('reuses an existing x-correlation-id header instead of generating one', () => {
    const middleware = new CorrelationMiddleware();
    const { req, res, next } = makeReqRes({ 'x-correlation-id': 'incoming-correlation-id' });

    middleware.use(req, res, next);

    expect(req.headers['x-correlation-id']).toBe('incoming-correlation-id');
    expect(next).toHaveBeenCalled();
  });
});
