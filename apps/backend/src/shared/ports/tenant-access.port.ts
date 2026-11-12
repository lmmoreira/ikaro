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

  /** Ids of suspended tenants, for the rare cross-tenant scan (never one `getAccess` per tenant). */
  listSuspendedTenantIds(): Promise<string[]>;

  /** Ids of operational tenants that lack one feature (ids only: never another tenant's state). */
  findTenantIdsNotEntitledTo(feature: FeatureKey): Promise<string[]>;
}
