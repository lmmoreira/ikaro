import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { CorrelationInterceptor } from './correlation.interceptor';

function makeContext(headers: Record<string, string> = {}): {
  context: ExecutionContext;
  headers: Record<string, string>;
  setHeader: jest.Mock;
} {
  const setHeader = jest.fn();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { context, headers, setHeader };
}

function makeHandler(): CallHandler {
  return { handle: () => of({ ok: true }) };
}

describe('CorrelationInterceptor', () => {
  let interceptor: CorrelationInterceptor;

  beforeEach(() => {
    interceptor = new CorrelationInterceptor();
  });

  it('generates a correlation ID when the request has none', () => {
    const { context, headers, setHeader } = makeContext();

    interceptor.intercept(context, makeHandler());

    expect(headers['x-correlation-id']).toBeDefined();
    expect(setHeader).toHaveBeenCalledWith('X-Correlation-ID', headers['x-correlation-id']);
  });

  it('reuses an existing x-correlation-id header instead of generating one', () => {
    const { context, headers, setHeader } = makeContext({
      'x-correlation-id': 'incoming-correlation-id',
    });

    interceptor.intercept(context, makeHandler());

    expect(headers['x-correlation-id']).toBe('incoming-correlation-id');
    expect(setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'incoming-correlation-id');
  });

  it('passes through the handler response unchanged', async () => {
    const { context } = makeContext();
    const result$ = interceptor.intercept(context, makeHandler());

    await expect(result$.toPromise()).resolves.toEqual({ ok: true });
  });
});
