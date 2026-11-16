import type { FeatureKey } from '@ikaro/types';
import { LockedFeatureCard } from './LockedFeatureCard';

interface LockedFeaturePageProps {
  readonly feature: FeatureKey;
}

// What a section layout renders instead of its page when the tenant does not hold the feature
// (UC-125, prototype `03b`): HTTP 200 with the explanation, never a 404, a redirect or a blank. The
// sidebar and bottom nav around it are the way out.
export function LockedFeaturePage({ feature }: LockedFeaturePageProps): React.JSX.Element {
  return <LockedFeatureCard feature={feature} variant="page" />;
}
