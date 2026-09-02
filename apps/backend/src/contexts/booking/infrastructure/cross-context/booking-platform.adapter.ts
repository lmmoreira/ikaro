import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  FRONTEND_REVALIDATION_PORT,
  IFrontendRevalidationPort,
} from '../../../platform/application/ports/frontend-revalidation.port';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { GetTenantsUseCase } from '../../../platform/application/use-cases/get-tenants.use-case';
import {
  ActiveTenantInfo,
  IBookingPlatformPort,
  TenantBusinessHoursAndLocale,
} from '../../application/ports/booking-platform.port';

@Injectable()
export class BookingPlatformAdapter implements IBookingPlatformPort {
  private readonly logger = new AppLogger(BookingPlatformAdapter.name);

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

  // Best-effort per the port contract — the tenant lookup runs after the caller's write
  // transaction has already committed, so a failure here must never surface as an error for an
  // operation that already succeeded (frontendRevalidation.revalidate() is itself best-effort;
  // this try/catch covers the tenant lookup, the only other thing that can throw in this method).
  async revalidatePublicPages(tenantId: string): Promise<void> {
    try {
      const tenant = await this.getTenantById.execute({ tenantId });
      await this.frontendRevalidation.revalidate(tenant.slug);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Hotsite revalidation skipped for tenant '${tenantId}': ${message}`);
    }
  }

  async getBusinessHoursAndLocale(tenantId: string): Promise<TenantBusinessHoursAndLocale> {
    const tenant = await this.getTenantById.execute({ tenantId });
    return {
      businessHours: tenant.settings.businessHours,
      locale: tenant.locale,
    };
  }
}
