export const BILLING_PLATFORM_PORT = Symbol('IBillingPlatformPort');

/** The only Platform facts Billing's access resolver reads about a tenant (M25-S13). */
export interface BillingTenantInfo {
  tenantId: string;
  slug: string;
  countryCode: string;
  timezone: string;
  createdAt: Date;
  /** `platform.tenants.is_active`: a deactivated tenant is never invoiced (UC-113 A11). */
  isActive: boolean;
}

/** The keyset position of the last tenant of a page: the next page starts after it. */
export interface BillingTenantCursor {
  createdAt: Date;
  id: string;
}

/**
 * Read-only tenant info for Billing. An unknown tenant is a typed
 * `BillingTenantNotFoundError`, never a transient error: the access resolver must not fail open
 * for an id that does not exist.
 */
export interface IBillingPlatformPort {
  getTenantInfo(tenantId: string): Promise<BillingTenantInfo>;

  /**
   * One keyset page of the tenants created strictly before `cutoff`, oldest first (`created_at`,
   * then `id`), active and inactive alike, starting after `after` when given. The self-heal job
   * (UC-140) walks it and diffs each page against Billing's own subscriptions.
   */
  listTenantsCreatedBefore(
    cutoff: Date,
    limit: number,
    after?: BillingTenantCursor,
  ): Promise<BillingTenantInfo[]>;
}
