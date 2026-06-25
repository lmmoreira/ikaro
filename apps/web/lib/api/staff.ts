import type { StaffResponse } from '@ikaro/types';

// Distinct from lib/api/dashboard/staff.ts's staff management calls: those use the Bearer-token
// bffClient (only configured inside an authenticated dashboard shell). This reads the httpOnly
// cookie server-side via the /api/staff/me proxy — for the hotsite auth bar, where no dashboard
// shell exists. `slug` is the hotsite currently being viewed, forwarded so the BFF's TenantGuard
// can reject a JWT issued for a different tenant — see getHotsiteCustomerProfile() for the same
// pattern on the customer side.
export async function getHotsiteStaffProfile(slug: string): Promise<StaffResponse | null> {
  try {
    const res = await fetch(`/api/staff/me?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    return (await res.json()) as StaffResponse;
  } catch {
    return null;
  }
}
