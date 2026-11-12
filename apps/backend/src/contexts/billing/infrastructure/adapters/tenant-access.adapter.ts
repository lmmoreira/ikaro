import { Injectable } from '@nestjs/common';
import type { FeatureKey } from '@ikaro/validation';
import type { TenantAccess, TenantAccessPort } from '../../../../shared/ports/tenant-access.port';
import { GetTenantAccessUseCase } from '../../application/use-cases/get-tenant-access.use-case';
import { ListSuspendedTenantIdsUseCase } from '../../application/use-cases/list-suspended-tenant-ids.use-case';
import { ListTenantIdsNotEntitledToUseCase } from '../../application/use-cases/list-tenant-ids-not-entitled-to.use-case';

/**
 * Billing's implementation of the shared `TenantAccessPort`. It holds no cache of its own: the
 * subscription repository the use cases read through is the cached layer
 * (`CachingSubscriptionRepository`), so every caller of the port, inside a use case or not, is
 * served from it.
 */
@Injectable()
export class TenantAccessAdapter implements TenantAccessPort {
  constructor(
    private readonly getTenantAccess: GetTenantAccessUseCase,
    private readonly listSuspended: ListSuspendedTenantIdsUseCase,
    private readonly listNotEntitled: ListTenantIdsNotEntitledToUseCase,
  ) {}

  getAccess(tenantId: string): Promise<TenantAccess> {
    return this.getTenantAccess.execute({ tenantId });
  }

  async listSuspendedTenantIds(): Promise<string[]> {
    return (await this.listSuspended.execute()).tenantIds;
  }

  async findTenantIdsNotEntitledTo(feature: FeatureKey): Promise<string[]> {
    return (await this.listNotEntitled.execute({ feature })).tenantIds;
  }
}
