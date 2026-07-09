import { describe, expect, it, vi } from 'vitest';
import { loadTeamDetailRouteData } from './team-route.server';
import { fetchStaffMember, StaffDetailFetchError } from '@/features/staff/api.server';

vi.mock('@/features/staff/api.server', () => ({
  fetchStaffMember: vi.fn(),
  StaffDetailFetchError: class StaffDetailFetchError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = 'StaffDetailFetchError';
      Object.setPrototypeOf(this, new.target.prototype);
    }
  },
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

describe('loadTeamDetailRouteData', () => {
  it('returns the loaded staff member', async () => {
    vi.mocked(fetchStaffMember).mockResolvedValue({ id: 'staff-1' } as never);

    await expect(loadTeamDetailRouteData('token-123', 'staff-1')).resolves.toEqual({
      staff: { id: 'staff-1' },
    });
  });

  it('calls notFound on 404', async () => {
    vi.mocked(fetchStaffMember).mockRejectedValue(new StaffDetailFetchError(404, 'missing'));

    await expect(loadTeamDetailRouteData('token-404', 'staff-404')).rejects.toThrow('notFound');
  });
});
