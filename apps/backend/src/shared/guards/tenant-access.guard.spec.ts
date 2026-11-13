import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StubExecutionContext } from '@ikaro/nestjs-http';
import { FEATURE_KEYS, type FeatureKey } from '@ikaro/validation';
import {
  BillingErrorCode,
  SUSPENSION_ACCESS_POLICIES,
  SUSPENSION_POLICIES,
  isAdmittedWhileSuspended,
  type ActorRole,
  type SuspensionAccessPolicy,
} from '@ikaro/types';
import { InMemoryTenantAccessPort } from '../../test/infrastructure/in-memory-tenant-access.port';
import type { TenantAccess, TenantAccessPort } from '../ports/tenant-access.port';
import { NoFeatureGate } from '../decorators/no-feature-gate.decorator';
import { RequiresFeature } from '../decorators/requires-feature.decorator';
import { SuspensionAccess } from '../decorators/suspension-access.decorator';
import { TenantAccessGuard } from './tenant-access.guard';

const TENANT = '0190d6a0-0000-7000-8000-00000000000a';

class Plain {
  handler(): void {}
}
class Gated {
  @RequiresFeature('BOOKING')
  handler(): void {}
}
class OpenHandler {
  @NoFeatureGate()
  handler(): void {}
}

function routeWith(...decorators: MethodDecorator[]): { cls: new () => object; name: 'handler' } {
  class Route {
    handler(): void {}
  }
  const descriptor = Object.getOwnPropertyDescriptor(Route.prototype, 'handler')!;
  decorators.forEach((decorate) => decorate(Route.prototype, 'handler', descriptor));
  return { cls: Route, name: 'handler' };
}

function contextFor(
  route: { cls: new () => object; name: 'handler' },
  headers: Record<string, string | undefined>,
): StubExecutionContext {
  return new StubExecutionContext(route.cls.prototype[route.name], route.cls, { headers });
}

function ctx(cls: new () => { handler(): void }, headers: Record<string, string | undefined>) {
  return contextFor({ cls, name: 'handler' }, headers);
}

const entitled = (keys: FeatureKey[]): TenantAccess => ({
  status: 'ACTIVE',
  suspensionReason: null,
  operational: true,
  features: keys.map((key) => ({ key, tier: 'STANDARD' as const })),
});

async function codeOf(promise: Promise<unknown>): Promise<{ status: number; code: unknown }> {
  try {
    await promise;
  } catch (err) {
    const e = err as HttpException;
    return { status: e.getStatus(), code: (e.getResponse() as Record<string, unknown>)['code'] };
  }
  throw new Error('expected the guard to reject');
}

describe('TenantAccessGuard', () => {
  let port: InMemoryTenantAccessPort;
  let guard: TenantAccessGuard;
  const headers = (role?: ActorRole) => ({ 'x-tenant-id': TENANT, 'x-actor-role': role });

  beforeEach(() => {
    port = new InMemoryTenantAccessPort();
    guard = new TenantAccessGuard(new Reflector(), port);
  });

  it('passes a request with no x-tenant-id without consulting the port', async () => {
    await expect(guard.canActivate(ctx(Plain, {}))).resolves.toBe(true);
    expect(port.getAccessCalls).toEqual([]);
  });

  it('allows an unannotated route for an operational tenant', async () => {
    await expect(guard.canActivate(ctx(Plain, headers('MANAGER')))).resolves.toBe(true);
  });

  it('denies an unannotated route for a suspended tenant with the typed 403', async () => {
    port.seedSuspended(TENANT);
    await expect(codeOf(guard.canActivate(ctx(Plain, headers('MANAGER'))))).resolves.toEqual({
      status: HttpStatus.FORBIDDEN,
      code: BillingErrorCode.TENANT_SUSPENDED,
    });
  });

  it('denies a feature the tenant lacks with the typed 403 and allows one it holds', async () => {
    port.seed(TENANT, entitled(['LOYALTY']));
    await expect(codeOf(guard.canActivate(ctx(Gated, headers('STAFF'))))).resolves.toEqual({
      status: HttpStatus.FORBIDDEN,
      code: BillingErrorCode.FEATURE_NOT_ENTITLED,
    });
    port.seed(TENANT, entitled(['BOOKING']));
    await expect(guard.canActivate(ctx(Gated, headers('STAFF')))).resolves.toBe(true);
  });

  it('@NoFeatureGate skips entitlement only: denied when suspended with the default policy', async () => {
    port.seed(TENANT, entitled([]));
    await expect(guard.canActivate(ctx(OpenHandler, headers('STAFF')))).resolves.toBe(true);
    port.seedSuspended(TENANT);
    await expect(codeOf(guard.canActivate(ctx(OpenHandler, headers('STAFF'))))).resolves.toEqual({
      status: HttpStatus.FORBIDDEN,
      code: BillingErrorCode.TENANT_SUSPENDED,
    });
  });

  it('@NoFeatureGate + ANY_AUTHENTICATED stays reachable while suspended, for any role', async () => {
    port.seedSuspended(TENANT);
    const route = routeWith(NoFeatureGate(), SuspensionAccess('ANY_AUTHENTICATED'));
    for (const role of ['CUSTOMER', 'STAFF', 'MANAGER'] as const) {
      await expect(guard.canActivate(contextFor(route, headers(role)))).resolves.toBe(true);
    }
  });

  describe.each(SUSPENSION_ACCESS_POLICIES)('suspended tenant on a %s route', (policy) => {
    it.each(['CUSTOMER', 'STAFF', 'MANAGER', undefined] as const)(
      'matches the policy table for a caller of role %s',
      async (role) => {
        port.seedSuspended(TENANT);
        const route = routeWith(NoFeatureGate(), SuspensionAccess(policy));
        const admitted = isAdmittedWhileSuspended(policy, role);
        const result = guard.canActivate(contextFor(route, headers(role)));
        if (admitted) await expect(result).resolves.toBe(true);
        else await expect(codeOf(result)).resolves.toMatchObject({ status: HttpStatus.FORBIDDEN });
      },
    );
  });

  it('covers every policy in the table', () => {
    expect(SUSPENSION_ACCESS_POLICIES).toEqual(Object.keys(SUSPENSION_POLICIES));
  });

  describe.each(FEATURE_KEYS)('feature %s', (feature) => {
    it('is allowed when entitled and denied when not, with no per-feature code', async () => {
      const route = routeWith(RequiresFeature(feature));
      port.seed(TENANT, entitled([feature]));
      await expect(guard.canActivate(contextFor(route, headers('MANAGER')))).resolves.toBe(true);
      port.seed(TENANT, entitled(FEATURE_KEYS.filter((key) => key !== feature)));
      await expect(
        codeOf(guard.canActivate(contextFor(route, headers('MANAGER')))),
      ).resolves.toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
    });
  });

  it("lets a request through when the lookup throws (an unknown tenant is the route's own 404)", async () => {
    class ThrowingPort extends InMemoryTenantAccessPort {
      override async getAccess(): Promise<TenantAccess> {
        throw new Error('tenant not found');
      }
    }
    const throwing: TenantAccessPort = new ThrowingPort();
    const failOpen = new TenantAccessGuard(new Reflector(), throwing);
    await expect(failOpen.canActivate(ctx(Gated, headers('MANAGER')))).resolves.toBe(true);
  });

  it("consults only the request's own tenant", async () => {
    await guard.canActivate(ctx(Plain, headers('MANAGER')));
    expect(port.getAccessCalls).toEqual([TENANT]);
  });

  it('reads the role from x-actor-role and ignores an unknown role value', async () => {
    port.seedSuspended(TENANT);
    const route = routeWith(NoFeatureGate(), SuspensionAccess('MANAGER_BILLING'));
    await expect(
      codeOf(guard.canActivate(contextFor(route, { ...headers(), 'x-actor-role': 'ROOT' }))),
    ).resolves.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('keeps a PUBLIC_MANIFEST route that declares its feature reachable for a suspended tenant with no feature', async () => {
    // The real suspended answer carries `features: []`: a suspended tenant holds nothing entitled.
    port.seed(TENANT, {
      status: 'SUSPENDED',
      suspensionReason: 'NON_PAYMENT',
      operational: false,
      features: [],
    });
    const route = routeWith(RequiresFeature('HOTSITE'), SuspensionAccess('PUBLIC_MANIFEST'));
    await expect(guard.canActivate(contextFor(route, { 'x-tenant-id': TENANT }))).resolves.toBe(
      true,
    );
  });

  it('lets a handler-level @RequiresFeature override a controller-level @NoFeatureGate', async () => {
    @NoFeatureGate()
    class ExemptController {
      @RequiresFeature('CHATBOT')
      handler(): void {}
    }
    port.seed(TENANT, entitled(['BOOKING']));
    await expect(
      codeOf(guard.canActivate(ctx(ExemptController, headers('MANAGER')))),
    ).resolves.toEqual({
      status: HttpStatus.FORBIDDEN,
      code: BillingErrorCode.FEATURE_NOT_ENTITLED,
    });
  });

  it('applies a controller-level @NoFeatureGate to a handler that declares no entitlement of its own', async () => {
    @NoFeatureGate()
    class ExemptController {
      handler(): void {}
    }
    port.seed(TENANT, entitled([]));
    await expect(guard.canActivate(ctx(ExemptController, headers('MANAGER')))).resolves.toBe(true);
  });

  it('declares its policy through the shared type (compile-time)', () => {
    const policy: SuspensionAccessPolicy = 'CUSTOMER_HISTORY';
    expect(SUSPENSION_POLICIES[policy].admits).toEqual(['CUSTOMER']);
  });
});
