import type { FeatureKey } from '@ikaro/validation';

export const TENANT_ACCESS_PORT = Symbol('TenantAccessPort');

export type TenantAccessStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';
export type TenantAccessSuspensionReason =
  'NON_PAYMENT' | 'CANCELED' | 'PAYMENT_REVERSED' | 'OPERATOR';
export type TenantAccessTier = 'STANDARD' | 'BASIC' | 'PLUS';

export interface TenantAccessFeature {
  key: FeatureKey;
  tier: TenantAccessTier;
}

/**
 * What the rest of the system learns about a tenant (docs/DOMAIN_MODEL.md § Entry point:
 * `TenantAccessPort`). `operational` is `status !== 'SUSPENDED'`; a feature is entitled when the
 * tenant is operational and the feature is in `features`.
 *
 * `provisional` and `degraded` are internal-only markers (M25-S13 discovery): no role-reduced view
 * ever carries them. `provisional`: a tenant inside the provisioning window, no subscription yet.
 * `degraded`: the fail-open answer after a lookup error (never cached).
 */
export interface TenantAccess {
  status: TenantAccessStatus;
  suspensionReason: TenantAccessSuspensionReason | null;
  operational: boolean;
  features: TenantAccessFeature[];
  /**
   * The first tenant-local day (`YYYY-MM-DD`) the BOOKING feature no longer applies, from a saved
   * removal of a running item or a trial selection without BOOKING; `null` or absent when none is
   * pending. Internal-only (M26-S18b): no role-reduced view carries it. This cached copy drives
   * the display clamps; the write paths read the authoritative `getBookableUntil`.
   */
  bookableUntil?: string | null;
  provisional?: true;
  degraded?: true;
}

/**
 * The one synchronous contract for "is this tenant operational, and is feature X entitled?".
 * Takes an explicit `tenantId` (never `RequestContext`: a cron has none). Billing implements it
 * behind a cache; every context injects `TENANT_ACCESS_PORT` without importing Billing.
 */
export interface TenantAccessPort {
  getAccess(tenantId: string): Promise<TenantAccess>;

  /**
   * The BOOKING cap read at write time (M26-S18b): bypasses every cache, so a second instance
   * holding a stale `getAccess` answer still refuses a commitment beyond the effective date. `null`
   * when no removal is pending. A failed read propagates (it never fails open).
   */
  getBookableUntil(tenantId: string): Promise<string | null>;

  /**
   * Ids of tenants whose subscription is `SUSPENDED`, for the rare cross-tenant scan (never one
   * `getAccess` per tenant). A tenant with no subscription row at all is not in this list even when
   * `getAccess` denies it after the provisioning window: Billing reads only its own tables here,
   * and the M26 self-heal job repairs that incident.
   */
  listSuspendedTenantIds(): Promise<string[]>;

  /** Ids of operational tenants that lack one feature (ids only: never another tenant's state). */
  findTenantIdsNotEntitledTo(feature: FeatureKey): Promise<string[]>;
}
