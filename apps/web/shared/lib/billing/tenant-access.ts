import type {
  BillingAccessManagerResponse,
  BillingAccessResponse,
  BillingAccessStaffResponse,
  FeatureKey,
} from '@ikaro/types';
import { ALL_FEATURES } from './feature-registry';

// What the dashboard needs from `GET /v1/billing/access`: whether the tenant is operational and
// which features it holds. `status` is deliberately absent: STAFF never receive it and no
// dashboard decision reads it (UC-121, role-reduced answer).
export interface TenantAccess {
  readonly operational: boolean;
  readonly features: readonly FeatureKey[];
}

// The role-reduced answer of a CUSTOMER lists plain feature keys, not the `{ key, tier }` entries
// the dashboard reads, and a malformed body must not become a lock: both read as "no usable
// answer", which the callers treat as fail-open.
export function toTenantAccess(response: BillingAccessResponse): TenantAccess | null {
  if (!('features' in response) || !Array.isArray(response.features)) return null;
  if (typeof response.operational !== 'boolean') return null;
  const features: readonly unknown[] = response.features;
  if (features.some((feature) => typeof feature !== 'object' || feature === null)) return null;
  return {
    operational: response.operational,
    // A key this build does not know (a feature the backend added first) is ignored, never read
    // as a lock on a known feature.
    features: (
      response.features as
        BillingAccessManagerResponse['features'] | BillingAccessStaffResponse['features']
    )
      .map((feature) => feature.key)
      .filter((key) => ALL_FEATURES.includes(key)),
  };
}

export function lockedFeaturesOf(access: TenantAccess): readonly FeatureKey[] {
  return ALL_FEATURES.filter((feature) => !access.features.includes(feature));
}
