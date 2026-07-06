import { describe, expect, it } from 'vitest';
import { matchTeamRoute } from './team-route';

describe('matchTeamRoute', () => {
  it('matches a staff detail route', () => {
    expect(matchTeamRoute('/dashboard/team/staff-1')).toEqual({ staffId: 'staff-1' });
  });

  it('returns null for the invite route (collides structurally with [id])', () => {
    expect(matchTeamRoute('/dashboard/team/invite')).toBeNull();
  });

  it('returns null for the list route', () => {
    expect(matchTeamRoute('/dashboard/team')).toBeNull();
  });

  it('returns null for other paths', () => {
    expect(matchTeamRoute('/dashboard/services')).toBeNull();
    expect(matchTeamRoute('/dashboard/team/staff-1/deactivate')).toBeNull();
  });
});
