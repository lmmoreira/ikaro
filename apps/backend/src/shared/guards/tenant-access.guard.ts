import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { readTenantAccessRequirement, throwProblemDetail } from '@ikaro/nestjs-http';
import { BillingErrorCode, evaluateTenantAccess } from '@ikaro/types';
import { isActorRole } from '../request/request-context';
import { AppLogger } from '../observability/app-logger';
import { TENANT_ACCESS_PORT, type TenantAccessPort } from '../ports/tenant-access.port';

type GateRequest = { headers: Record<string, string | string[] | undefined> };

/**
 * The one declarative choke point for entitlement and suspension on backend routes (UC-125,
 * docs/ENGINEERING_RULES_SHARED.md § Tenant access enforcement). It reads the route's metadata with
 * `Reflector`, asks `TenantAccessPort` (served by the cached subscription repository) and applies
 * the shared `evaluateTenantAccess` decision; it knows no feature and no policy by name.
 *
 * A Guard, never an Interceptor: an Interceptor does not run for a Guard-rejected request. Guards
 * also run before `RequestInterceptor` builds `RequestContext`, so the tenant and the role are read
 * from the request headers directly (the same trust boundary as `ManagerRoleGuard`).
 *
 * A request with no `x-tenant-id` has no tenant to gate and passes through (scheduler, Pub/Sub,
 * outbox-relay and health calls). A failed lookup, including an unknown tenant, passes through too:
 * the port already fails open on a transient error, and an unknown tenant is the route's own 404.
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  private readonly logger = new AppLogger(TenantAccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(TENANT_ACCESS_PORT) private readonly access: TenantAccessPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<GateRequest>();
    const tenantId = readHeader(req, 'x-tenant-id');
    if (!tenantId) return true;

    const requirement = readTenantAccessRequirement(this.reflector, context);
    const rawRole = readHeader(req, 'x-actor-role');
    const role = rawRole !== undefined && isActorRole(rawRole) ? rawRole : undefined;

    let verdict;
    try {
      verdict = evaluateTenantAccess(await this.access.getAccess(tenantId), requirement, role);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // `tenantId` is passed explicitly: a guard runs before `RequestContext` exists, so the
      // logger's own enrichment has no tenant to add.
      this.logger.warn(
        `Tenant access lookup did not answer, letting the request through: ${message}`,
        { tenantId },
      );
      return true;
    }

    if (verdict === 'FEATURE_NOT_ENTITLED') {
      throw throwProblemDetail(
        HttpStatus.FORBIDDEN,
        BillingErrorCode.FEATURE_NOT_ENTITLED,
        'The tenant plan does not include this feature',
      );
    }
    if (verdict === 'TENANT_SUSPENDED') {
      throw throwProblemDetail(
        HttpStatus.FORBIDDEN,
        BillingErrorCode.TENANT_SUSPENDED,
        'The tenant is suspended',
      );
    }
    return true;
  }
}

function readHeader(req: GateRequest, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
