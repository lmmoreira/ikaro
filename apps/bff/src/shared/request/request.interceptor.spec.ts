import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ITracingPort, SpanAttributeValue } from '@ikaro/observability';
import { lastValueFrom, Observable, of, Subscriber } from 'rxjs';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { RequestContext, runWithRequestContext } from './request-context';
import { RequestInterceptor } from './request.interceptor';

function makeContext(user?: CurrentUserPayload): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function makeUser(overrides: Partial<CurrentUserPayload> = {}): CurrentUserPayload {
  return {
    sub: 'staff-uuid-1',
    tenantId: 'tid-1',
    tenantSlug: 'acme',
    tenantName: 'Acme',
    userName: 'Jane',
    role: 'MANAGER',
    locale: 'pt-BR',
    ...overrides,
  };
}

// Records calls instead of talking to a real span — this is exactly the testability gap the
// ITracingPort refactor closes: previously trace.getActiveSpan()?.setAttributes(...) had no
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
}

describe('RequestInterceptor (BFF)', () => {
  let interceptor: RequestInterceptor;
  let tracingPort: FakeTracingPort;

  beforeEach(() => {
    tracingPort = new FakeTracingPort();
    interceptor = new RequestInterceptor(tracingPort);
  });

  // Mirrors production: CorrelationMiddleware establishes the RequestContext (correlationId
  // only) before any Interceptor runs — the interceptor only enriches an already-active store.
  function withRequestContext<T>(correlationId: string, fn: () => T): T {
    return runWithRequestContext(correlationId, fn);
  }

  it('enriches tenantId onto the already-active context when req.user is present', async () => {
    const requestContext = new RequestContext();
    let capturedTenantId: string | undefined;
    let capturedCorrelationId: string | undefined;

    const handler: CallHandler = {
      handle: () => {
        capturedTenantId = requestContext.tenantId;
        capturedCorrelationId = requestContext.correlationId;
        return of(null);
      },
    };

    await withRequestContext('corr-1', () =>
      lastValueFrom(interceptor.intercept(makeContext(makeUser()), handler)),
    );

    expect(capturedTenantId).toBe('tid-1');
    expect(capturedCorrelationId).toBe('corr-1');
  });

  it('leaves tenantId/actor fields undefined when req.user is absent (guest/unauthenticated request)', async () => {
    const requestContext = new RequestContext();
    let capturedTenantId: string | undefined = 'not-set';
    let capturedActorId: string | undefined;

    const handler: CallHandler = {
      handle: () => {
        capturedTenantId = requestContext.tenantId;
        capturedActorId = requestContext.actorId;
        return of(null);
      },
    };

    await withRequestContext('corr-2', () =>
      lastValueFrom(interceptor.intercept(makeContext(undefined), handler)),
    );

    expect(capturedTenantId).toBeUndefined();
    expect(capturedActorId).toBeUndefined();
  });

  it('correlationId is already available even before the interceptor enriches anything (the whole point of the middleware/interceptor split)', async () => {
    const requestContext = new RequestContext();
    let capturedCorrelationId: string | undefined;

    await withRequestContext('corr-pre-enrichment', () => {
      // Read BEFORE calling intercept() at all — proves correlationId doesn't depend on this
      // interceptor having run, only on CorrelationMiddleware (simulated here by
      // withRequestContext) having run.
      capturedCorrelationId = requestContext.correlationId;
    });

    expect(capturedCorrelationId).toBe('corr-pre-enrichment');
  });

  it('maps role CUSTOMER to actorType CUSTOMER, every other role to STAFF', async () => {
    const requestContext = new RequestContext();
    const capturedTypes: Array<string | undefined> = [];

    const handler: CallHandler = {
      handle: () => {
        capturedTypes.push(requestContext.actorType);
        return of(null);
      },
    };

    await withRequestContext('corr-3', () =>
      lastValueFrom(interceptor.intercept(makeContext(makeUser({ role: 'CUSTOMER' })), handler)),
    );
    await withRequestContext('corr-4', () =>
      lastValueFrom(interceptor.intercept(makeContext(makeUser({ role: 'MANAGER' })), handler)),
    );
    await withRequestContext('corr-5', () =>
      lastValueFrom(interceptor.intercept(makeContext(makeUser({ role: 'STAFF' })), handler)),
    );

    expect(capturedTypes).toEqual(['CUSTOMER', 'STAFF', 'STAFF']);
  });

  it('populates actorId and actorRole alongside actorType when req.user is present', async () => {
    const requestContext = new RequestContext();
    let capturedActorId: string | undefined;
    let capturedActorRole: string | undefined;

    const handler: CallHandler = {
      handle: () => {
        capturedActorId = requestContext.actorId;
        capturedActorRole = requestContext.actorRole;
        return of(null);
      },
    };

    await withRequestContext('corr-6', () =>
      lastValueFrom(
        interceptor.intercept(makeContext(makeUser({ sub: 'staff-7', role: 'MANAGER' })), handler),
      ),
    );

    expect(capturedActorId).toBe('staff-7');
    expect(capturedActorRole).toBe('MANAGER');
  });

  it('sets tenant.id and user.id span attributes via the tracing port when req.user is present', async () => {
    const handler: CallHandler = { handle: () => of(null) };

    await withRequestContext('corr-7', () =>
      lastValueFrom(interceptor.intercept(makeContext(makeUser({ sub: 'staff-9' })), handler)),
    );

    expect(tracingPort.calls).toEqual([{ 'tenant.id': 'tid-1', 'user.id': 'staff-9' }]);
  });

  it('does not call the tracing port at all when req.user is absent (guest/unauthenticated request)', async () => {
    const handler: CallHandler = { handle: () => of(null) };

    await withRequestContext('corr-8', () =>
      lastValueFrom(interceptor.intercept(makeContext(undefined), handler)),
    );

    expect(tracingPort.calls).toEqual([]);
  });

  it('concurrent requests store independent contexts', async () => {
    const requestContext = new RequestContext();
    const results: Array<{ tenantId: string | undefined; correlationId: string }> = [];

    const makeSlowHandler = (delay: number): CallHandler => ({
      handle: () =>
        new Observable((sub: Subscriber<null>) => {
          setTimeout(() => {
            results.push({
              tenantId: requestContext.tenantId,
              correlationId: requestContext.correlationId,
            });
            sub.next(null);
            sub.complete();
          }, delay);
        }),
    });

    await Promise.all([
      withRequestContext('corr-a', () =>
        lastValueFrom(
          interceptor.intercept(
            makeContext(makeUser({ tenantId: 'tenant-a' })),
            makeSlowHandler(20),
          ),
        ),
      ),
      withRequestContext('corr-b', () =>
        lastValueFrom(
          interceptor.intercept(
            makeContext(makeUser({ tenantId: 'tenant-b' })),
            makeSlowHandler(10),
          ),
        ),
      ),
    ]);

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.tenantId === 'tenant-a')).toBeDefined();
    expect(results.find((r) => r.tenantId === 'tenant-b')).toBeDefined();
  });
});
