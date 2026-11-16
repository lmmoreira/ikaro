import type { FeatureKey } from '@ikaro/types';

// The one route-to-feature registry the dashboard reads (M25-S29, UC-125). It mirrors the feature
// each section's routes declare with `@RequiresFeature` on the backend, which is the only
// enforcement point: this file decides what the web draws (a locked nav item, the locked page),
// never what is allowed.

// Exhaustive on purpose: adding a `FeatureKey` is a compile error here until it is listed, so the
// list of all features is never a second hand-kept copy of the closed enum.
const ALL_FEATURES_MAP: Readonly<Record<FeatureKey, true>> = {
  HOTSITE: true,
  BOOKING: true,
  LOYALTY: true,
  CHATBOT: true,
  LEAD_FORM: true,
};

export const ALL_FEATURES: readonly FeatureKey[] = Object.keys(ALL_FEATURES_MAP) as FeatureKey[];

// A route prefix matches whole path segments (`/dashboard/team` matches `/dashboard/team/invite`,
// never `/dashboard/teamwork`).
export const ROUTE_FEATURES: ReadonlyArray<readonly [prefix: string, feature: FeatureKey]> = [
  ['/dashboard/bookings', 'BOOKING'],
  ['/dashboard/schedule', 'BOOKING'],
  ['/dashboard/services', 'BOOKING'],
  ['/dashboard/resources', 'BOOKING'],
  ['/dashboard/scheduling-exceptions', 'BOOKING'],
  ['/dashboard/loyalty', 'LOYALTY'],
  ['/dashboard/leads', 'LEAD_FORM'],
  ['/dashboard/hotsite', 'HOTSITE'],
  ['/dashboard/team', 'HOTSITE'],
  ['/dashboard/settings', 'HOTSITE'],
];

// Routes no feature owns: the entry redirect and the two pages that sit outside the sectioned
// shell. The registry spec fails on a dashboard page that is neither here nor in ROUTE_FEATURES.
export const UNGATED_ROUTES: readonly string[] = [
  '/dashboard',
  '/dashboard/login',
  '/dashboard/suspended',
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function featureForPath(pathname: string): FeatureKey | null {
  for (const [prefix, feature] of ROUTE_FEATURES) {
    if (matchesPrefix(pathname, prefix)) return feature;
  }
  return null;
}

export function isRouteLocked(pathname: string, lockedFeatures: readonly FeatureKey[]): boolean {
  const feature = featureForPath(pathname);
  return feature !== null && lockedFeatures.includes(feature);
}
