export interface ResourceRouteMatch {
  readonly resourceId: string;
  readonly action: 'edit' | 'deactivate';
}

// Unlike services (edit lives at /:id/edit), a resource's edit screen is the bare /:id route —
// so "new" would otherwise match this pattern as a resourceId. isResourceCreateRoute() must be
// checked by the caller before this, same relationship as isServiceCreateRoute() to
// matchServiceRoute() (see topbar-route.ts's resolveResourceTitleAndBackLink()).
const RESOURCE_ROUTE = /^\/dashboard\/resources\/([^/]+)(?:\/(deactivate))?$/;

export function matchResourceRoute(pathname: string): ResourceRouteMatch | null {
  if (isResourceCreateRoute(pathname)) return null;

  const match = RESOURCE_ROUTE.exec(pathname);
  if (!match) return null;

  return {
    resourceId: match[1],
    action: match[2] === 'deactivate' ? 'deactivate' : 'edit',
  };
}

export function isResourceCreateRoute(pathname: string): boolean {
  return pathname === '/dashboard/resources/new';
}
