import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, Observable, of, Subscriber } from 'rxjs';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { RequestContext } from './request-context';
import { RequestInterceptor } from './request.interceptor';

function makeContext(
  headers: Record<string, string | undefined>,
  user?: CurrentUserPayload,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers, user }) }),
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

describe('RequestInterceptor (BFF)', () => {
  let interceptor: RequestInterceptor;

  beforeEach(() => {
    interceptor = new RequestInterceptor();
  });

  it('makes correlationId and tenantId available inside the observable when req.user is present', async () => {
    const ctx = makeContext({ 'x-correlation-id': 'corr-1' }, makeUser());
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

    await lastValueFrom(interceptor.intercept(ctx, handler));

    expect(capturedTenantId).toBe('tid-1');
    expect(capturedCorrelationId).toBe('corr-1');
  });

  it('leaves tenantId/actor fields undefined when req.user is absent (guest/unauthenticated request)', async () => {
    const ctx = makeContext({ 'x-correlation-id': 'corr-2' });
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

    await lastValueFrom(interceptor.intercept(ctx, handler));

    expect(capturedTenantId).toBeUndefined();
    expect(capturedActorId).toBeUndefined();
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

    await lastValueFrom(
      interceptor.intercept(makeContext({}, makeUser({ role: 'CUSTOMER' })), handler),
    );
    await lastValueFrom(
      interceptor.intercept(makeContext({}, makeUser({ role: 'MANAGER' })), handler),
    );
    await lastValueFrom(
      interceptor.intercept(makeContext({}, makeUser({ role: 'STAFF' })), handler),
    );

    expect(capturedTypes).toEqual(['CUSTOMER', 'STAFF', 'STAFF']);
  });

  it('populates actorId and actorRole alongside actorType when req.user is present', async () => {
    const ctx = makeContext({}, makeUser({ sub: 'staff-7', role: 'MANAGER' }));
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

    await lastValueFrom(interceptor.intercept(ctx, handler));

    expect(capturedActorId).toBe('staff-7');
    expect(capturedActorRole).toBe('MANAGER');
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
      lastValueFrom(
        interceptor.intercept(
          makeContext({ 'x-correlation-id': 'corr-a' }, makeUser({ tenantId: 'tenant-a' })),
          makeSlowHandler(20),
        ),
      ),
      lastValueFrom(
        interceptor.intercept(
          makeContext({ 'x-correlation-id': 'corr-b' }, makeUser({ tenantId: 'tenant-b' })),
          makeSlowHandler(10),
        ),
      ),
    ]);

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.tenantId === 'tenant-a')).toBeDefined();
    expect(results.find((r) => r.tenantId === 'tenant-b')).toBeDefined();
  });
});
