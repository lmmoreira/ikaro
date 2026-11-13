import { SetMetadata } from '@nestjs/common';
import type { FeatureKey, SuspensionAccessPolicy } from '@ikaro/types';
import {
  NO_FEATURE_GATE_KEY,
  REQUIRES_FEATURE_KEY,
  SUSPENSION_ACCESS_KEY,
} from './tenant-access-metadata';

/**
 * Declares the sellable feature a route belongs to (UC-125). `TenantAccessGuard` refuses a tenant
 * whose access answer does not list the feature with `BILLING_FEATURE_NOT_ENTITLED`. The guard
 * knows no feature by name: a new feature is a new `FeatureKey` and a decorated controller.
 */
export const RequiresFeature = (feature: FeatureKey) => SetMetadata(REQUIRES_FEATURE_KEY, feature);

/**
 * Declares who may reach a route while the tenant is `SUSPENDED` (UC-125). The policy set and the
 * roles each one admits live in `SUSPENSION_POLICIES` (`@ikaro/types`); a route without this
 * decorator is `DEFAULT_DENY`. The role comes from `X-Actor-Role` in the backend and the JWT in the
 * BFF.
 */
export const SuspensionAccess = (policy: SuspensionAccessPolicy) =>
  SetMetadata(SUSPENSION_ACCESS_KEY, policy);

/**
 * Marks a route no sellable feature owns (health, auth, the access read itself). It skips the
 * **entitlement** check only: the suspension policy still applies, so pair it with
 * `@SuspensionAccess(...)` where a suspended tenant must stay reachable.
 */
export const NoFeatureGate = () => SetMetadata(NO_FEATURE_GATE_KEY, true);
