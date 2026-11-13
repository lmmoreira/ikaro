import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StubExecutionContext } from '@ikaro/nestjs-http';
import { FEATURE_KEYS, type FeatureKey } from '@ikaro/validation';
import {
  BillingErrorCode,
  SUSPENSION_ACCESS_POLICIES,
  isAdmittedWhileSuspended,
  type ActorRole,
  type TenantAccessView,
} from '@ikaro/types';
import { NoFeatureGate } from '../decorators/no-feature-gate.decorator';
import { Public } from '../decorators/public.decorator';
import { RequiresFeature } from '../decorators/requires-feature.decorator';
import { SuspensionAccess } from '../decorators/suspension-access.decorator';
import { TenantAccessGuard } from './tenant-access.guard';
import type { TenantAccessSource } from './tenant-access.lookup';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '10000000-0000-4000-8000-000000000002';
const SLUG = 'autospa';

class InMemoryAccessSource implements TenantAccessSource {
  readonly accessCalls: string[] = [];
  readonly slugCalls: string[] = [];
  private readonly access = new Map<string, TenantAccessView>();
  private readonly slugs = new Map<string, string>();
  failWith?: Error;

  seed(tenantId: string, view: TenantAccessView): void {
    this.access.set(tenantId, view);
  }
  seedSlug(slug: string, tenantId: string): void {
    this.slugs.set(slug, tenantId);
  }
  async getAccess(tenantId: string): Promise<TenantAccessView> {
    this.accessCalls.push(tenantId);
    if (this.failWith) throw this.failWith;
    return this.access.get(tenantId) ?? { operational: true, features: allFeatures() };
  }
  async resolveTenantId(slug: string): Promise<string> {
    this.slugCalls.push(slug);
    const id = this.slugs.get(slug);
    if (!id) throw new Error('unknown slug');
    return id;
  }
}

const allFeatures = (): TenantAccessView['features'] => FEATURE_KEYS.map((key) => ({ key }));
const suspended: TenantAccessView = { operational: false, features: allFeatures() };

function routeWith(...decorators: (MethodDecorator & ClassDecorator)[]) {
  class Route {
    handler(): void {}
  }
  const descriptor = Object.getOwnPropertyDescriptor(Route.prototype, 'handler')!;
  decorators.forEach((decorate) => decorate(Route.prototype, 'handler', descriptor));
  return Route;
}

function contextFor(
  route: new () => { handler(): void },
  req: { headers?: Record<string, string>; params?: Record<string, string>; user?: unknown },
): StubExecutionContext {
  return new StubExecutionContext(route.prototype.handler, route, { headers: {}, ...req });
}

const jwt = (role: ActorRole, tenantId = TENANT_ID) => ({
  sub: 'actor-1',
  tenantId,
  tenantSlug: SLUG,
  role,
});

async function denial(promise: Promise<unknown>): Promise<{ status: number; code: unknown }> {
  try {
    await promise;
  } catch (err) {
    const e = err as HttpException;
    return { status: e.getStatus(), code: (e.getResponse() as Record<string, unknown>)['code'] };
  }
  throw new Error('expected the guard to reject');
}

describe('TenantAccessGuard (BFF)', () => {
  let source: InMemoryAccessSource;
  let guard: TenantAccessGuard;

  beforeEach(() => {
    source = new InMemoryAccessSource();
    guard = new TenantAccessGuard(new Reflector(), source);
  });

  it('allows an unannotated route for an operational tenant', async () => {
    const route = routeWith();
    await expect(guard.canActivate(contextFor(route, { user: jwt('MANAGER') }))).resolves.toBe(
      true,
    );
  });

  it('denies an unannotated route for a suspended tenant with the typed 403', async () => {
    source.seed(TENANT_ID, suspended);
    const route = routeWith();
    await expect(
      denial(guard.canActivate(contextFor(route, { user: jwt('MANAGER') }))),
    ).resolves.toEqual({ status: HttpStatus.FORBIDDEN, code: BillingErrorCode.TENANT_SUSPENDED });
  });

  it('@NoFeatureGate skips entitlement only: the default policy still denies a suspended tenant', async () => {
    const route = routeWith(NoFeatureGate());
    source.seed(TENANT_ID, { operational: true, features: [] });
    await expect(guard.canActivate(contextFor(route, { user: jwt('STAFF') }))).resolves.toBe(true);
    source.seed(TENANT_ID, suspended);
    await expect(
      denial(guard.canActivate(contextFor(route, { user: jwt('STAFF') }))),
    ).resolves.toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
  });

  describe.each(SUSPENSION_ACCESS_POLICIES)('suspended tenant on a %s route', (policy) => {
    it.each(['CUSTOMER', 'STAFF', 'MANAGER'] as const)(
      'matches the policy table for a %s caller (role read from the JWT)',
      async (role) => {
        source.seed(TENANT_ID, suspended);
        const route = routeWith(NoFeatureGate(), SuspensionAccess(policy));
        const result = guard.canActivate(contextFor(route, { user: jwt(role) }));
        if (isAdmittedWhileSuspended(policy, role)) await expect(result).resolves.toBe(true);
        else await expect(denial(result)).resolves.toMatchObject({ status: HttpStatus.FORBIDDEN });
      },
    );
  });

  describe.each(FEATURE_KEYS)('feature %s', (feature: FeatureKey) => {
    it('is allowed when entitled and denied when not, with no per-feature code', async () => {
      const route = routeWith(RequiresFeature(feature));
      await expect(guard.canActivate(contextFor(route, { user: jwt('MANAGER') }))).resolves.toBe(
        true,
      );
      source.seed(TENANT_ID, {
        operational: true,
        features: allFeatures().filter((entry) => entry.key !== feature),
      });
      await expect(
        denial(guard.canActivate(contextFor(route, { user: jwt('MANAGER') }))),
      ).resolves.toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
    });
  });

  it('consults only the tenant of the caller JWT, never another tenant', async () => {
    const route = routeWith();
    await guard.canActivate(contextFor(route, { user: jwt('MANAGER', TENANT_ID) }));
    expect(source.accessCalls).toEqual([TENANT_ID]);
    expect(source.accessCalls).not.toContain(OTHER_TENANT_ID);
  });

  it('lets an unauthenticated non-public request through without a lookup', async () => {
    await expect(guard.canActivate(contextFor(routeWith(), {}))).resolves.toBe(true);
    expect(source.accessCalls).toEqual([]);
  });

  it("fails open when the lookup fails (an unknown tenant is the route's own handling)", async () => {
    source.failWith = new Error('backend down');
    const route = routeWith(RequiresFeature('BOOKING'));
    await expect(guard.canActivate(contextFor(route, { user: jwt('MANAGER') }))).resolves.toBe(
      true,
    );
  });

  describe('@Public() routes (slug in X-Tenant-Slug)', () => {
    const publicRoute = (...extra: (MethodDecorator & ClassDecorator)[]) =>
      routeWith(Public(), ...extra);
    const slugReq = { headers: { 'x-tenant-slug': SLUG } };

    beforeEach(() => source.seedSlug(SLUG, TENANT_ID));

    it('passes an operational tenant', async () => {
      await expect(guard.canActivate(contextFor(publicRoute(), slugReq))).resolves.toBe(true);
      expect(source.slugCalls).toEqual([SLUG]);
      expect(source.accessCalls).toEqual([TENANT_ID]);
    });

    it('PUBLIC_NONE refuses a suspended tenant and PUBLIC_MANIFEST keeps it reachable', async () => {
      source.seed(TENANT_ID, suspended);
      const none = publicRoute(NoFeatureGate(), SuspensionAccess('PUBLIC_NONE'));
      await expect(denial(guard.canActivate(contextFor(none, slugReq)))).resolves.toMatchObject({
        code: BillingErrorCode.TENANT_SUSPENDED,
      });
      const manifest = publicRoute(NoFeatureGate(), SuspensionAccess('PUBLIC_MANIFEST'));
      await expect(guard.canActivate(contextFor(manifest, slugReq))).resolves.toBe(true);
    });

    it("leaves an unknown slug untouched for the route's own not-found handling", async () => {
      const req = { headers: { 'x-tenant-slug': 'no-such-tenant' } };
      await expect(guard.canActivate(contextFor(publicRoute(), req))).resolves.toBe(true);
      expect(source.accessCalls).toEqual([]);
    });

    it('lets a request with no slug header through (withPublicTenant answers the 400)', async () => {
      await expect(guard.canActivate(contextFor(publicRoute(), {}))).resolves.toBe(true);
      expect(source.slugCalls).toEqual([]);
    });

    it('fails open when the access lookup fails', async () => {
      source.failWith = new Error('backend down');
      await expect(guard.canActivate(contextFor(publicRoute(), slugReq))).resolves.toBe(true);
    });

    describe('a route that carries the slug in its URL path (the hotsite manifest)', () => {
      const pathReq = { headers: {}, params: { slug: SLUG } };

      it('resolves the tenant from the :slug path param when there is no X-Tenant-Slug header', async () => {
        const manifest = publicRoute(
          RequiresFeature('HOTSITE'),
          SuspensionAccess('PUBLIC_MANIFEST'),
        );
        await expect(guard.canActivate(contextFor(manifest, pathReq))).resolves.toBe(true);
        expect(source.slugCalls).toEqual([SLUG]);
        expect(source.accessCalls).toEqual([TENANT_ID]);
      });

      it('keeps the manifest reachable for a suspended tenant that holds no feature', async () => {
        source.seed(TENANT_ID, { operational: false, features: [] });
        const manifest = publicRoute(
          RequiresFeature('HOTSITE'),
          SuspensionAccess('PUBLIC_MANIFEST'),
        );
        await expect(guard.canActivate(contextFor(manifest, pathReq))).resolves.toBe(true);
      });

      it('applies the declared feature gate to the manifest route instead of skipping the lookup', async () => {
        source.seed(TENANT_ID, { operational: true, features: [{ key: 'BOOKING' }] });
        const manifest = publicRoute(
          RequiresFeature('HOTSITE'),
          SuspensionAccess('PUBLIC_MANIFEST'),
        );
        await expect(
          denial(guard.canActivate(contextFor(manifest, pathReq))),
        ).resolves.toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
      });

      it('prefers the path slug when both the path and the header carry one', async () => {
        const both = { headers: { 'x-tenant-slug': 'other' }, params: { slug: SLUG } };
        await expect(guard.canActivate(contextFor(publicRoute(), both))).resolves.toBe(true);
        expect(source.slugCalls).toEqual([SLUG]);
      });
    });
  });

  describe('entitlement scope', () => {
    it('lets a handler-level @RequiresFeature override a controller-level @NoFeatureGate', async () => {
      @NoFeatureGate()
      class ExemptController {
        @RequiresFeature('CHATBOT')
        handler(): void {}
      }
      source.seed(TENANT_ID, { operational: true, features: [{ key: 'BOOKING' }] });
      await expect(
        denial(guard.canActivate(contextFor(ExemptController, { user: jwt('MANAGER') }))),
      ).resolves.toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
    });
  });
});
