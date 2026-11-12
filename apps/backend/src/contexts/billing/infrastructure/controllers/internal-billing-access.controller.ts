import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { CanonicalParseUUIDPipe } from '@ikaro/nestjs-http';
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
  @Get('tenants/:tenantId/access')
  getAccess(@Param('tenantId', CanonicalParseUUIDPipe) tenantId: string): Promise<TenantAccess> {
    return this.access.getAccess(tenantId).catch(mapBillingError);
  }

  @Get('suspended-tenant-ids')
  async listSuspendedTenantIds(): Promise<{ tenantIds: string[] }> {
    return { tenantIds: await this.access.listSuspendedTenantIds() };
  }
}
