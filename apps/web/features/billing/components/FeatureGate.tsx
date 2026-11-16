import type { FeatureKey } from '@ikaro/types';
import { isFeatureLocked } from '@/shared/lib/billing/feature-registry';
import { LockedFeaturePage } from './LockedFeaturePage';

interface FeatureGateProps {
  // The feature that owns the route being rendered (null for an ungated one).
  readonly feature: FeatureKey | null;
  readonly lockedFeatures: readonly FeatureKey[];
  readonly children: React.ReactNode;
}

// Renders the locked page instead of `children` when the tenant does not hold `feature` (UC-125).
// It runs on the server inside the section layout, so a locked feature's own page never executes
// and its denied reads cannot fail before the lock shows. A failed access lookup arrives here as an
// empty `lockedFeatures`, which renders the children as before billing (fail open).
export function FeatureGate({
  feature,
  lockedFeatures,
  children,
}: FeatureGateProps): React.JSX.Element {
  if (feature !== null && isFeatureLocked(feature, lockedFeatures)) {
    return <LockedFeaturePage feature={feature} />;
  }
  return <>{children}</>;
}
