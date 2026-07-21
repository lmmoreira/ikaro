import {
  enrichRequestContext,
  getRequestStore,
  RequestContext,
  runWithRequestContext,
} from './request-context';

describe('RequestContext (BFF)', () => {
  it('throws when accessed outside an active request context', () => {
    const ctx = new RequestContext();
    expect(() => ctx.correlationId).toThrow();
  });

  it('returns undefined for tenantId/actor fields outside an active request context', () => {
    const ctx = new RequestContext();
    expect(ctx.tenantId).toBeUndefined();
    expect(ctx.actorId).toBeUndefined();
    expect(ctx.actorType).toBeUndefined();
    expect(ctx.actorRole).toBeUndefined();
  });

  it('exposes correlationId as soon as runWithRequestContext runs, before any enrichment', () => {
    const ctx = new RequestContext();
    let captured: { correlationId: string; tenantId: string | undefined } | undefined;

    runWithRequestContext('corr-1', () => {
      captured = { correlationId: ctx.correlationId, tenantId: ctx.tenantId };
    });

    expect(captured).toEqual({ correlationId: 'corr-1', tenantId: undefined });
  });

  it('exposes tenantId once enrichRequestContext runs inside the same context', () => {
    const ctx = new RequestContext();
    let capturedTenantId: string | undefined;

    runWithRequestContext('corr-1', () => {
      enrichRequestContext('tenant-1');
      capturedTenantId = ctx.tenantId;
    });

    expect(capturedTenantId).toBe('tenant-1');
  });

  it('leaves tenantId undefined when enrichRequestContext is never called (guest/unauthenticated request, or a guard-rejected one)', () => {
    const ctx = new RequestContext();
    let capturedTenantId: string | undefined = 'not-set';

    runWithRequestContext('corr-2', () => {
      capturedTenantId = ctx.tenantId;
    });

    expect(capturedTenantId).toBeUndefined();
  });

  it('exposes actor fields once enrichRequestContext provides them', () => {
    const ctx = new RequestContext();
    let captured: { actorId?: string; actorType?: string; actorRole?: string } = {};

    runWithRequestContext('corr-3', () => {
      enrichRequestContext('tenant-1', {
        actorId: 'staff-1',
        actorType: 'STAFF',
        actorRole: 'MANAGER',
      });
      captured = { actorId: ctx.actorId, actorType: ctx.actorType, actorRole: ctx.actorRole };
    });

    expect(captured).toEqual({ actorId: 'staff-1', actorType: 'STAFF', actorRole: 'MANAGER' });
  });

  it('enrichRequestContext is a no-op outside an active request context (defensive only)', () => {
    expect(() => enrichRequestContext('tenant-1')).not.toThrow();
  });

  it('getRequestStore returns undefined outside an active request context', () => {
    expect(getRequestStore()).toBeUndefined();
  });

  it('concurrent requests store independent, mutable contexts', async () => {
    const ctx = new RequestContext();
    const results: Array<{ tenantId: string | undefined; correlationId: string }> = [];

    const runSlow = (correlationId: string, tenantId: string, delay: number) =>
      new Promise<void>((resolve) => {
        runWithRequestContext(correlationId, () => {
          enrichRequestContext(tenantId);
          setTimeout(() => {
            results.push({ tenantId: ctx.tenantId, correlationId: ctx.correlationId });
            resolve();
          }, delay);
        });
      });

    await Promise.all([runSlow('corr-a', 'tenant-a', 20), runSlow('corr-b', 'tenant-b', 10)]);

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.tenantId === 'tenant-a')).toBeDefined();
    expect(results.find((r) => r.tenantId === 'tenant-b')).toBeDefined();
  });
});
