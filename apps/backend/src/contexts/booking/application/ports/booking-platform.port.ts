import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';

export const BOOKING_PLATFORM_PORT = Symbol('IBookingPlatformPort');

export interface ActiveTenantInfo {
  id: string;
  timezone: string;
}

export interface TenantBusinessHoursAndLocale {
  businessHours: BusinessHours;
  locale: string;
}

export interface IBookingPlatformPort {
  findAllActive(): Promise<ActiveTenantInfo[]>;
  // Best-effort — never throws (see FrontendRevalidationAdapter). Called after a service
  // create/update/activate/deactivate commits, so the public booking page's cached services
  // list doesn't wait out the full ISR window to reflect the change.
  revalidatePublicPages(tenantId: string): Promise<void>;
  // M21-S02 part 2: used by CreateTenantLocationResourceUseCase to build the tenant's default
  // LOCATION resource at provisioning time — business hours for Resource.create()'s invariant,
  // locale for the default name ("Localização Principal" / "Main Location").
  getBusinessHoursAndLocale(tenantId: string): Promise<TenantBusinessHoursAndLocale>;
  // Must be called inside an active ITransactionManager.run() block. Row-locks the tenant
  // (pessimistic_write) and bypasses the read cache entirely, serializing against a concurrent
  // UpdateTenantSettingsUseCase write — the authoritative counterpart to
  // getBusinessHoursAndLocale above for a caller validating businessHours mid-transaction —
  // the cached read above is not safe for that.
  getBusinessHoursAndLocaleForUpdate(tenantId: string): Promise<TenantBusinessHoursAndLocale>;
}
