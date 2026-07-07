export interface TeamRouteMatch {
  readonly staffId: string;
  readonly action: 'edit' | 'deactivate';
}

export interface TeamLayoutPlan {
  readonly initialStaffRoleStatus: 'STAFF' | 'MANAGER' | null;
  readonly createAction: { readonly href: string; readonly label: string } | null;
}

// The team detail route has no /edit suffix (unlike services' /[id]/edit), so a
// single dynamic segment after /dashboard/team collides structurally with the
// static /invite route (both are one path segment) — /invite must be excluded
// explicitly here. The optional /deactivate suffix is the one nested action route.
const TEAM_ROUTE = /^\/dashboard\/team\/([^/]+)(?:\/(deactivate))?$/;

export function matchTeamRoute(pathname: string): TeamRouteMatch | null {
  const match = TEAM_ROUTE.exec(pathname);
  if (!match || match[1] === 'invite') return null;

  return { staffId: match[1], action: match[2] === 'deactivate' ? 'deactivate' : 'edit' };
}

export function isTeamInviteRoute(pathname: string): boolean {
  return pathname === '/dashboard/team/invite';
}

export function resolveTeamLayoutPlan(pathname: string, inviteLabel: string): TeamLayoutPlan {
  return {
    initialStaffRoleStatus: isTeamInviteRoute(pathname) ? 'STAFF' : null,
    createAction:
      pathname === '/dashboard/team'
        ? { href: '/dashboard/team/invite', label: inviteLabel }
        : null,
  };
}
