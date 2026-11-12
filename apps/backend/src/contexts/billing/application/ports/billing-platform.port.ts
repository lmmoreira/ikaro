export const BILLING_PLATFORM_PORT = Symbol('IBillingPlatformPort');

/** The only Platform facts Billing's access resolver reads about a tenant (M25-S13). */
export interface BillingTenantInfo {
  tenantId: string;
  slug: string;
  countryCode: string;
  timezone: string;
  createdAt: Date;
}

/**
 * Read-only tenant info for Billing. An unknown tenant is a typed
 * `BillingTenantNotFoundError`, never a transient error: the access resolver must not fail open
 * for an id that does not exist.
 */
export interface IBillingPlatformPort {
  getTenantInfo(tenantId: string): Promise<BillingTenantInfo>;
}
