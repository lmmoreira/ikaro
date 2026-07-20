import { getRequestStore, RequestContext, runWithRequestContext } from './request-context';

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

  it('exposes correlationId and tenantId set by runWithRequestContext', () => {
    const ctx = new RequestContext();
    let captured: { correlationId: string; tenantId: string | undefined } | undefined;

    runWithRequestContext(
      'corr-1',
      () => {
        captured = { correlationId: ctx.correlationId, tenantId: ctx.tenantId };
      },
      'tenant-1',
    );

    expect(captured).toEqual({ correlationId: 'corr-1', tenantId: 'tenant-1' });
  });

  it('leaves tenantId undefined when not provided (guest/unauthenticated request)', () => {
    const ctx = new RequestContext();
    let capturedTenantId: string | undefined = 'not-set';

    runWithRequestContext('corr-2', () => {
      capturedTenantId = ctx.tenantId;
    });

    expect(capturedTenantId).toBeUndefined();
  });

  it('exposes actor fields when provided', () => {
    const ctx = new RequestContext();
    let captured: { actorId?: string; actorType?: string; actorRole?: string } = {};

    runWithRequestContext(
      'corr-3',
      () => {
        captured = { actorId: ctx.actorId, actorType: ctx.actorType, actorRole: ctx.actorRole };
      },
      'tenant-1',
      { actorId: 'staff-1', actorType: 'STAFF', actorRole: 'MANAGER' },
    );

    expect(captured).toEqual({ actorId: 'staff-1', actorType: 'STAFF', actorRole: 'MANAGER' });
  });

  it('getRequestStore returns undefined outside an active request context', () => {
    expect(getRequestStore()).toBeUndefined();
  });

  it('concurrent requests store independent contexts', async () => {
    const ctx = new RequestContext();
    const results: Array<{ tenantId: string | undefined; correlationId: string }> = [];

    const runSlow = (correlationId: string, tenantId: string, delay: number) =>
      new Promise<void>((resolve) => {
        runWithRequestContext(
          correlationId,
          () => {
            setTimeout(() => {
              results.push({ tenantId: ctx.tenantId, correlationId: ctx.correlationId });
              resolve();
            }, delay);
          },
          tenantId,
        );
      });

    await Promise.all([runSlow('corr-a', 'tenant-a', 20), runSlow('corr-b', 'tenant-b', 10)]);

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.tenantId === 'tenant-a')).toBeDefined();
    expect(results.find((r) => r.tenantId === 'tenant-b')).toBeDefined();
  });
});
