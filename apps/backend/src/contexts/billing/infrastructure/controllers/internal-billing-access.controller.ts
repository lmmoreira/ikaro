import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { CanonicalParseUUIDPipe, NoFeatureGate, SuspensionAccess } from '@ikaro/nestjs-http';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import {
  TENANT_ACCESS_PORT,
  type TenantAccess,
  type TenantAccessPort,
} from '../../../../shared/ports/tenant-access.port';
import { mapBillingError } from '../http/billing-error.mapper';

// Tenant-less by design: `/internal/*` skips the RequestInterceptor, so the tenant is the explicit
// path parameter. Called by the BFF guard and the BFF access route (M25-S13). It serves the cached
// answer of the shared port, so a hot tenant costs one cache read, not a database read.
@UseGuards(InternalApiGuard)
@Controller('internal/billing')
export class InternalBillingAccessController {
  constructor(@Inject(TENANT_ACCESS_PORT) private readonly access: TenantAccessPort) {}

  // The full backend answer (reason and internal markers included): role reduction is the BFF's job.
  // The gate's own lookup: the BFF forwards the caller's `X-Tenant-ID` on this call, so without
  // this declaration `TenantAccessGuard` would refuse the very read that tells it a tenant is
  // suspended (default policy), and the BFF guard would then fail open. No feature owns it, and it
  // stays reachable while suspended.
  @Get('tenants/:tenantId/access')
  @NoFeatureGate()
  @SuspensionAccess('ANY_AUTHENTICATED')
  getAccess(@Param('tenantId', CanonicalParseUUIDPipe) tenantId: string): Promise<TenantAccess> {
    return this.access.getAccess(tenantId).catch(mapBillingError);
  }

  @Get('suspended-tenant-ids')
  async listSuspendedTenantIds(): Promise<{ tenantIds: string[] }> {
    return { tenantIds: await this.access.listSuspendedTenantIds() };
  }
}
