import {
  ActiveTenantInfo,
  IBookingPlatformPort,
  TenantBusinessHoursAndLocale,
} from '../../contexts/booking/application/ports/booking-platform.port';
import { FULL_WEEK_BUSINESS_HOURS } from '../utils/business-hours-fixtures';

export class InMemoryBookingPlatformPort implements IBookingPlatformPort {
  private readonly tenants: ActiveTenantInfo[] = [];
  readonly revalidatedTenantIds: string[] = [];
  private readonly businessHoursAndLocaleByTenant = new Map<string, TenantBusinessHoursAndLocale>();

  seed(tenants: ActiveTenantInfo[]): void {
    this.tenants.push(...tenants);
  }

  seedBusinessHoursAndLocale(tenantId: string, value: TenantBusinessHoursAndLocale): void {
    this.businessHoursAndLocaleByTenant.set(tenantId, value);
  }

  clear(): void {
    this.tenants.length = 0;
    this.businessHoursAndLocaleByTenant.clear();
  }

  async findAllActive(): Promise<ActiveTenantInfo[]> {
    return [...this.tenants];
  }

  async revalidatePublicPages(tenantId: string): Promise<void> {
    this.revalidatedTenantIds.push(tenantId);
  }

  async getBusinessHoursAndLocale(tenantId: string): Promise<TenantBusinessHoursAndLocale> {
    return (
      this.businessHoursAndLocaleByTenant.get(tenantId) ?? {
        businessHours: FULL_WEEK_BUSINESS_HOURS,
        locale: 'pt-BR',
      }
    );
  }
}
