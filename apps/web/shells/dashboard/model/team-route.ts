export interface TeamRouteMatch {
  readonly staffId: string;
}

export interface TeamLayoutPlan {
  readonly initialStaffRoleStatus: 'STAFF' | 'MANAGER' | null;
  readonly createAction: { readonly href: string; readonly label: string } | null;
}

// A single dynamic segment after /dashboard/team collides structurally with the
// static /invite route (both are one path segment) — unlike services' /[id]/edit
// (two segments), so /invite must be excluded explicitly here.
const TEAM_DETAIL_ROUTE = /^\/dashboard\/team\/([^/]+)$/;

export function matchTeamRoute(pathname: string): TeamRouteMatch | null {
  const match = TEAM_DETAIL_ROUTE.exec(pathname);
  if (!match || match[1] === 'invite') return null;

  return { staffId: match[1] };
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
