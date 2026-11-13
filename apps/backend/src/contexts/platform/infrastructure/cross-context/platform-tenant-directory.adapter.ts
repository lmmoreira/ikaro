import { Injectable } from '@nestjs/common';
import type {
  ActiveTenant,
  ITenantDirectoryPort,
} from '../../../../shared/ports/tenant-directory.port';
import { GetTenantsUseCase } from '../../application/use-cases/get-tenants.use-case';

@Injectable()
export class PlatformTenantDirectoryAdapter implements ITenantDirectoryPort {
  constructor(private readonly getTenants: GetTenantsUseCase) {}

  async listActiveTenants(): Promise<ActiveTenant[]> {
    const { items } = await this.getTenants.execute({ status: 'ACTIVE' });
    return items.map((tenant) => ({ id: tenant.id, timezone: tenant.timezone }));
  }
}
