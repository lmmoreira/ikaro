export const BOOKING_PLATFORM_PORT = Symbol('IBookingPlatformPort');

export interface ActiveTenantInfo {
  id: string;
  timezone: string;
}

export interface IBookingPlatformPort {
  findAllActive(): Promise<ActiveTenantInfo[]>;
  // Best-effort — never throws (see FrontendRevalidationAdapter). Called after a service
  // create/update/activate/deactivate commits, so the public booking page's cached services
  // list doesn't wait out the full ISR window to reflect the change.
  revalidatePublicPages(tenantId: string): Promise<void>;
}
