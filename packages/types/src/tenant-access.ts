import type { ActorRole } from './enums';

/**
 * Who may reach a route while the tenant is `SUSPENDED` (UC-125, docs/ENGINEERING_RULES_SHARED.md
 * § Tenant access enforcement). One table, one evaluator: the backend and BFF guards, and the web
 * registry later, read this and never switch on a policy name, so a new policy is one entry here
 * (a spec fails if an entry has no evaluated behaviour) and no guard changes.
 *
 * `admits`:
 * - `NONE` — nobody (the default, and the public routes a suspended tenant refuses);
 * - `EVERYONE` — any caller, authenticated or not (the public hotsite manifest);
 * - `AUTHENTICATED` — any caller that carries a role;
 * - a role list — only those roles; a caller of another role on the same route is denied.
 */
export type SuspensionAdmits = 'NONE' | 'EVERYONE' | 'AUTHENTICATED' | readonly ActorRole[];

export const SUSPENSION_POLICIES = {
  DEFAULT_DENY: { admits: 'NONE' },
  MANAGER_BILLING: { admits: ['MANAGER'] },
  STAFF_NOTICE: { admits: ['STAFF', 'MANAGER'] },
  CUSTOMER_HISTORY: { admits: ['CUSTOMER'] },
  AUTH_TENANT_SWITCH: { admits: 'AUTHENTICATED' },
  ANY_AUTHENTICATED: { admits: 'AUTHENTICATED' },
  PUBLIC_MANIFEST: { admits: 'EVERYONE' },
  PUBLIC_NONE: { admits: 'NONE' },
} as const satisfies Record<string, { admits: SuspensionAdmits }>;

export type SuspensionAccessPolicy = keyof typeof SUSPENSION_POLICIES;

export const SUSPENSION_ACCESS_POLICIES = Object.keys(
  SUSPENSION_POLICIES,
) as SuspensionAccessPolicy[];

/** The part of a tenant's access answer the gate needs; `TenantAccess` satisfies it structurally. */
export interface TenantAccessView {
  operational: boolean;
  features: readonly { key: string }[];
}

export interface TenantAccessRequirement {
  /** `@RequiresFeature(key)`; absent when the route owns no feature. */
  feature?: string;
  /** `@NoFeatureGate()`: skip the entitlement check only, never the suspension policy. */
  noFeatureGate?: boolean;
  /** `@SuspensionAccess(policy)`; absent means `DEFAULT_DENY`. */
  policy?: SuspensionAccessPolicy;
}

export type TenantAccessVerdict = 'ALLOW' | 'TENANT_SUSPENDED' | 'FEATURE_NOT_ENTITLED';

/** Whether `policy` lets a caller of `role` (undefined = unauthenticated) through a suspension. */
export function isAdmittedWhileSuspended(
  policy: SuspensionAccessPolicy,
  role: ActorRole | undefined,
): boolean {
  // Widened from the per-entry literal tuples so `includes` accepts any role.
  const admits: SuspensionAdmits = SUSPENSION_POLICIES[policy].admits;
  if (admits === 'NONE') return false;
  if (admits === 'EVERYONE') return true;
  if (role === undefined) return false;
  if (admits === 'AUTHENTICATED') return true;
  return admits.includes(role);
}

/**
 * The one decision both guards apply. Suspension first (a suspended tenant that the policy does not
 * admit is refused whatever it owns), then entitlement, which a route that owns no feature or opts
 * out with `@NoFeatureGate()` skips. Suspension never changes the feature list, so a route that a
 * policy admits during a suspension still answers on the features the tenant holds.
 */
export function evaluateTenantAccess(
  access: TenantAccessView,
  requirement: TenantAccessRequirement,
  role: ActorRole | undefined,
): TenantAccessVerdict {
  if (!access.operational) {
    const policy = requirement.policy ?? 'DEFAULT_DENY';
    if (!isAdmittedWhileSuspended(policy, role)) return 'TENANT_SUSPENDED';
  }
  const { feature, noFeatureGate } = requirement;
  if (feature !== undefined && noFeatureGate !== true) {
    if (!access.features.some((entry) => entry.key === feature)) return 'FEATURE_NOT_ENTITLED';
  }
  return 'ALLOW';
}
