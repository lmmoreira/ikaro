import { Inject, Injectable } from '@nestjs/common';
import {
  FRONTEND_REVALIDATION_PORT,
  IFrontendRevalidationPort,
} from '../../../platform/application/ports/frontend-revalidation.port';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { GetTenantsUseCase } from '../../../platform/application/use-cases/get-tenants.use-case';
import {
  ActiveTenantInfo,
  IBookingPlatformPort,
} from '../../application/ports/booking-platform.port';

@Injectable()
export class BookingPlatformAdapter implements IBookingPlatformPort {
  constructor(
    private readonly getTenants: GetTenantsUseCase,
    private readonly getTenantById: GetTenantByIdUseCase,
    @Inject(FRONTEND_REVALIDATION_PORT)
    private readonly frontendRevalidation: IFrontendRevalidationPort,
  ) {}

  async findAllActive(): Promise<ActiveTenantInfo[]> {
    const result = await this.getTenants.execute({ status: 'ACTIVE' });
    return result.items.map((tenant) => ({
      id: tenant.id,
      timezone: tenant.timezone,
    }));
  }

  async revalidatePublicPages(tenantId: string): Promise<void> {
    const tenant = await this.getTenantById.execute({ tenantId });
    await this.frontendRevalidation.revalidate(tenant.slug);
  }
}
