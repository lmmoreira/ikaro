import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingErrorCode, evaluateTenantAccess, type TenantAccessView } from '@ikaro/types';
import { Request } from 'express';
import { getCurrentUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { throwProblemDetail } from '../http/problem-detail';
import { AppLogger } from '../observability/app-logger';
import { readTenantAccessRequirement } from './tenant-access-metadata';
import { TenantAccessLookup, type TenantAccessSource } from './tenant-access.lookup';

/**
 * The one declarative choke point for entitlement and suspension on BFF routes (UC-125,
 * docs/ENGINEERING_RULES_SHARED.md § Tenant access enforcement). It reads the route's metadata with
 * `Reflector`, asks the tenant-access lookup (the backend answer behind a bounded TTL cache) and
 * applies the shared `evaluateTenantAccess` decision; it knows no feature and no policy by name.
 *
 * A Guard, never an Interceptor (an Interceptor does not run for a Guard-rejected request), and
 * registered **last**, after `ActiveStaffGuard`: identity, tenant, role and active-staff failures
 * keep their own errors and a deactivated staff member never costs an access lookup.
 *
 * An `@Public()` route carries a slug, not a tenant id: the guard resolves it through the cache
 * `withPublicTenant` shares, so a public request costs one by-slug hop per TTL window. An unknown
 * slug is left to the route's own handling and a failed lookup fails open.
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  private readonly logger = new AppLogger(TenantAccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(TenantAccessLookup) private readonly lookup: TenantAccessSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user = getCurrentUser(req);

    let verdict;
    try {
      const tenantId = await this.resolveTenantId(req, isPublic === true, user?.tenantId);
      if (!tenantId) return true;
      const access: TenantAccessView = await this.lookup.getAccess(tenantId, req);
      verdict = evaluateTenantAccess(
        access,
        readTenantAccessRequirement(this.reflector, context),
        isPublic ? undefined : user?.role,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Tenant access lookup did not answer, letting the request through: ${message}`,
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

  private async resolveTenantId(
    req: Request,
    isPublic: boolean,
    jwtTenantId: string | undefined,
  ): Promise<string | undefined> {
    if (!isPublic) return jwtTenantId;
    const slug = req.headers['x-tenant-slug'];
    // No slug: the route's own `withPublicTenant` answers 400 TENANT_SLUG_HEADER_REQUIRED.
    return typeof slug === 'string' && slug.length > 0
      ? this.lookup.resolveTenantId(slug, req)
      : undefined;
  }
}
