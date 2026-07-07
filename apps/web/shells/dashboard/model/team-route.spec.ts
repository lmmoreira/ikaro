import { describe, expect, it } from 'vitest';
import { isTeamInviteRoute, matchTeamRoute, resolveTeamLayoutPlan } from './team-route';

describe('matchTeamRoute', () => {
  it('matches a staff detail route', () => {
    expect(matchTeamRoute('/dashboard/team/staff-1')).toEqual({
      staffId: 'staff-1',
      action: 'edit',
    });
  });

  it('matches a staff deactivate route', () => {
    expect(matchTeamRoute('/dashboard/team/staff-1/deactivate')).toEqual({
      staffId: 'staff-1',
      action: 'deactivate',
    });
  });

  it('returns null for the invite route (collides structurally with [id])', () => {
    expect(matchTeamRoute('/dashboard/team/invite')).toBeNull();
  });

  it('returns null for the list route', () => {
    expect(matchTeamRoute('/dashboard/team')).toBeNull();
  });

  it('returns null for other paths', () => {
    expect(matchTeamRoute('/dashboard/services')).toBeNull();
  });
});

describe('isTeamInviteRoute', () => {
  it('returns true only for the exact invite route', () => {
    expect(isTeamInviteRoute('/dashboard/team/invite')).toBe(true);
    expect(isTeamInviteRoute('/dashboard/team')).toBe(false);
    expect(isTeamInviteRoute('/dashboard/team/staff-1')).toBe(false);
  });
});

describe('resolveTeamLayoutPlan', () => {
  it('seeds STAFF as the initial role status and no create action on the invite route', () => {
    expect(resolveTeamLayoutPlan('/dashboard/team/invite', 'Convidar membro')).toEqual({
      initialStaffRoleStatus: 'STAFF',
      createAction: null,
    });
  });

  it('provides a create action and no initial role status on the list route', () => {
    expect(resolveTeamLayoutPlan('/dashboard/team', 'Convidar membro')).toEqual({
      initialStaffRoleStatus: null,
      createAction: { href: '/dashboard/team/invite', label: 'Convidar membro' },
    });
  });

  it('returns no action and no initial role status on the detail route', () => {
    expect(resolveTeamLayoutPlan('/dashboard/team/staff-1', 'Convidar membro')).toEqual({
      initialStaffRoleStatus: null,
      createAction: null,
    });
  });
});
