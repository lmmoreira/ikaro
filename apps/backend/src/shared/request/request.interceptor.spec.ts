import { CallHandler, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { lastValueFrom, Observable, of, Subscriber } from 'rxjs';
import { InMemoryTenantSettingsPort } from '../../test/infrastructure/in-memory-tenant-settings.port';
import { ITenantSettingsPort } from '../ports/tenant-settings.port';
import { RequestContext } from './request-context';
import { RequestInterceptor } from './request.interceptor';

function makeContext(
  headers: Record<string, string | undefined>,
  path = '/api/resource',
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers, path }) }),
  } as unknown as ExecutionContext;
}

const mockCallHandler: CallHandler = { handle: () => of('result') };
let settingsPort: InMemoryTenantSettingsPort;
let interceptor: RequestInterceptor;

beforeEach(() => {
  settingsPort = new InMemoryTenantSettingsPort();
  interceptor = new RequestInterceptor(settingsPort);
});

describe('RequestInterceptor', () => {
  it('throws 400 Problem Detail when X-Tenant-ID header is missing', async () => {
    let caught: HttpException | null = null;
    try {
      await interceptor.intercept(makeContext({}), mockCallHandler);
    } catch (e) {
      caught = e as HttpException;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect(caught!.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    const body = caught!.getResponse() as Record<string, unknown>;
    expect(body['status']).toBe(400);
    expect(body['title']).toBe('Missing Tenant Header');
  });

  it('throws 404 Problem Detail when the tenant settings lookup fails', async () => {
    const notFoundPort: ITenantSettingsPort = {
      getSettings: () => Promise.reject(new Error('not found')),
    };
    const notFoundInterceptor = new RequestInterceptor(notFoundPort);

    let caught: HttpException | null = null;
    try {
      await notFoundInterceptor.intercept(
        makeContext({ 'x-tenant-id': 'unknown' }),
        mockCallHandler,
      );
    } catch (e) {
      caught = e as HttpException;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect(caught!.getStatus()).toBe(HttpStatus.NOT_FOUND);
    const body = caught!.getResponse() as Record<string, unknown>;
    expect(body['title']).toBe('Tenant Not Found');
  });

  it('makes tenantId, correlationId and settings available inside the observable', async () => {
    const ctx = makeContext({ 'x-tenant-id': 'tid-1', 'x-correlation-id': 'corr-1' });
    const requestContext = new RequestContext();

    let capturedTenantId: string | undefined;
    let capturedCorrelationId: string | undefined;
    let capturedCurrency: string | undefined;

    const handler: CallHandler = {
      handle: () => {
        capturedTenantId = requestContext.tenantId;
        capturedCorrelationId = requestContext.correlationId;
        capturedCurrency = requestContext.settings.localization.currency;
        return of(null);
      },
    };

    await lastValueFrom(await interceptor.intercept(ctx, handler));

    expect(capturedTenantId).toBe('tid-1');
    expect(capturedCorrelationId).toBe('corr-1');
    expect(capturedCurrency).toBe('BRL');
  });

  it('generates correlationId when X-Correlation-ID is absent', async () => {
    const ctx = makeContext({ 'x-tenant-id': 'tid-1' });
    const requestContext = new RequestContext();

    let capturedCorrelationId: string | undefined;
    const handler: CallHandler = {
      handle: () => {
        capturedCorrelationId = requestContext.correlationId;
        return of(null);
      },
    };

    await lastValueFrom(await interceptor.intercept(ctx, handler));

    expect(capturedCorrelationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ['health routes', '/health/live'],
    ['internal routes', '/internal/tenants'],
    ['cron routes', '/cron/reminders'],
  ])('skips tenant check for %s', async (_label, path) => {
    const ctx = makeContext({}, path);
    const result = await interceptor.intercept(ctx, mockCallHandler);
    expect(result).toBeDefined();
  });

  it('populates actorId, actorType, actorRole when X-Actor-* headers are present', async () => {
    const ctx = makeContext({
      'x-tenant-id': 'tid-1',
      'x-correlation-id': 'corr-1',
      'x-actor-id': 'staff-uuid-1',
      'x-actor-type': 'STAFF',
      'x-actor-role': 'MANAGER',
    });
    const requestContext = new RequestContext();

    let capturedActorId: string | undefined;
    let capturedActorType: string | undefined;
    let capturedActorRole: string | undefined;

    const handler: CallHandler = {
      handle: () => {
        capturedActorId = requestContext.actorId;
        capturedActorType = requestContext.actorType;
        capturedActorRole = requestContext.actorRole;
        return of(null);
      },
    };

    await lastValueFrom(await interceptor.intercept(ctx, handler));

    expect(capturedActorId).toBe('staff-uuid-1');
    expect(capturedActorType).toBe('STAFF');
    expect(capturedActorRole).toBe('MANAGER');
  });

  it('rejects unknown actorType values — only STAFF and CUSTOMER are accepted', async () => {
    const ctx = makeContext({
      'x-tenant-id': 'tid-1',
      'x-actor-id': 'user-1',
      'x-actor-type': 'ADMIN',
      'x-actor-role': 'MANAGER',
    });
    const requestContext = new RequestContext();
    let capturedActorType: string | undefined;

    const handler: CallHandler = {
      handle: () => {
        capturedActorType = requestContext.actorType;
        return of(null);
      },
    };

    await lastValueFrom(await interceptor.intercept(ctx, handler));
    expect(capturedActorType).toBeUndefined();
  });

  it('leaves actor fields undefined when X-Actor-* headers are absent (guest request)', async () => {
    const ctx = makeContext({ 'x-tenant-id': 'tid-1', 'x-correlation-id': 'corr-1' });
    const requestContext = new RequestContext();

    let capturedActorId: string | undefined;

    const handler: CallHandler = {
      handle: () => {
        capturedActorId = requestContext.actorId;
        return of(null);
      },
    };

    await lastValueFrom(await interceptor.intercept(ctx, handler));

    expect(capturedActorId).toBeUndefined();
  });

  it('concurrent requests store independent tenant contexts', async () => {
    const requestContext = new RequestContext();
    const results: Array<{ tenantId: string; correlationId: string }> = [];

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
        await interceptor.intercept(
          makeContext({ 'x-tenant-id': 'tenant-a', 'x-correlation-id': 'corr-a' }),
          makeSlowHandler(20),
        ),
      ),
      lastValueFrom(
        await interceptor.intercept(
          makeContext({ 'x-tenant-id': 'tenant-b', 'x-correlation-id': 'corr-b' }),
          makeSlowHandler(10),
        ),
      ),
    ]);

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.tenantId === 'tenant-a')).toBeDefined();
    expect(results.find((r) => r.tenantId === 'tenant-b')).toBeDefined();
  });
});
