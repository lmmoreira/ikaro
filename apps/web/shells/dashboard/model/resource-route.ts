export interface ResourceRouteMatch {
  readonly resourceId: string;
  readonly action: 'edit' | 'deactivate';
}

// Mirrors team-route.ts's shape: the resource detail route has no /edit suffix, so a single
// dynamic segment after /dashboard/resources collides structurally with the static /new
// route (both are one path segment) — /new must be excluded explicitly here. The optional
// /deactivate suffix is the one nested action route (serving both deactivate and reactivate).
const RESOURCE_ROUTE = /^\/dashboard\/resources\/([^/]+)(?:\/(deactivate))?$/;

export function matchResourceRoute(pathname: string): ResourceRouteMatch | null {
  const match = RESOURCE_ROUTE.exec(pathname);
  if (!match || match[1] === 'new') return null;

  return { resourceId: match[1], action: match[2] === 'deactivate' ? 'deactivate' : 'edit' };
}

export function isResourceCreateRoute(pathname: string): boolean {
  return pathname === '/dashboard/resources/new';
}
