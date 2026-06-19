import type { CustomerProfileResponse } from '@ikaro/types';

// Distinct from lib/api/dashboard/customers.ts's getCustomerProfile(): that one calls the
// Bearer-token bffClient (only configured inside an authenticated dashboard shell). This one
// reads the httpOnly cookie server-side via the /api/customers/me proxy — for contexts like the
// public hotsite where no dashboard shell (and no in-memory token) exists yet.
export async function getHotsiteCustomerProfile(): Promise<CustomerProfileResponse | null> {
  const res = await fetch('/api/customers/me');
  if (!res.ok) return null;
  return (await res.json()) as CustomerProfileResponse;
}
