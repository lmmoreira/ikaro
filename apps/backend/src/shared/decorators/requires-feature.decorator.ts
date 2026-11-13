import { SetMetadata } from '@nestjs/common';
import { REQUIRES_FEATURE_KEY } from '@ikaro/nestjs-http';
import type { FeatureKey } from '@ikaro/validation';

/**
 * Declares the sellable feature a route belongs to (UC-125). `TenantAccessGuard` refuses a tenant
 * whose access answer does not list the feature with `BILLING_FEATURE_NOT_ENTITLED`. The guard
 * knows no feature by name: a new feature is a new `FeatureKey` and a decorated controller.
 */
export const RequiresFeature = (feature: FeatureKey) => SetMetadata(REQUIRES_FEATURE_KEY, feature);
