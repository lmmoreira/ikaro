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
  private readonly autoApproveEnabledByTenant = new Map<string, boolean>();

  seed(tenants: ActiveTenantInfo[]): void {
    this.tenants.push(...tenants);
  }

  seedBusinessHoursAndLocale(tenantId: string, value: TenantBusinessHoursAndLocale): void {
    this.businessHoursAndLocaleByTenant.set(tenantId, value);
  }

  seedAutoApproveEnabled(tenantId: string, value: boolean): void {
    this.autoApproveEnabledByTenant.set(tenantId, value);
  }

  clear(): void {
    this.tenants.length = 0;
    this.businessHoursAndLocaleByTenant.clear();
    this.autoApproveEnabledByTenant.clear();
  }

  async findAllActive(): Promise<ActiveTenantInfo[]> {
    return [...this.tenants];
  }

  async revalidatePublicPages(tenantId: string): Promise<void> {
    this.revalidatedTenantIds.push(tenantId);
  }

  async getBusinessHoursAndLocale(tenantId: string): Promise<TenantBusinessHoursAndLocale> {
    return this.readBusinessHoursAndLocale(tenantId);
  }

  // Kept as an independent method (not delegating to getBusinessHoursAndLocale above) so a spec
  // spying on one doesn't see calls from the other — this double has no real caching to
  // distinguish them, but the two are separate methods on the real port and tests assert on
  // which one a caller used.
  async getBusinessHoursAndLocaleForUpdate(
    tenantId: string,
  ): Promise<TenantBusinessHoursAndLocale> {
    return this.readBusinessHoursAndLocale(tenantId);
  }

  private readBusinessHoursAndLocale(tenantId: string): TenantBusinessHoursAndLocale {
    return (
      this.businessHoursAndLocaleByTenant.get(tenantId) ?? {
        businessHours: FULL_WEEK_BUSINESS_HOURS,
        locale: 'pt-BR',
      }
    );
  }

  async getAutoApproveEnabled(tenantId: string): Promise<boolean> {
    return this.autoApproveEnabledByTenant.get(tenantId) ?? false;
  }
}
