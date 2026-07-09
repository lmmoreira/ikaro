import { cache } from 'react';
import { notFound } from 'next/navigation';
import { StaffDetailFetchError, fetchStaffMember } from '@/features/staff/api.server';

export interface TeamDetailRouteData {
  readonly staff: Awaited<ReturnType<typeof fetchStaffMember>>;
}

export const loadTeamDetailRouteData = cache(async function loadTeamDetailRouteData(
  token: string,
  staffId: string,
): Promise<TeamDetailRouteData> {
  try {
    const staff = await fetchStaffMember(token, staffId);
    return { staff };
  } catch (err) {
    if (err instanceof StaffDetailFetchError && err.status === 404) {
      notFound();
    }
    throw err;
  }
});
