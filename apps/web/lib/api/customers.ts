import type { CustomerProfileResponse } from '@ikaro/types';

// Distinct from lib/api/dashboard/customers.ts's getCustomerProfile()/updateCustomerProfile():
// those call the Bearer-token bffClient (only configured inside an authenticated dashboard
// shell). These read/write the httpOnly cookie server-side via the /api/customers/me proxy —
// for contexts like the public hotsite where no dashboard shell (and no in-memory token)
// exists yet.
export async function getHotsiteCustomerProfile(): Promise<CustomerProfileResponse | null> {
  try {
    const res = await fetch('/api/customers/me');
    if (!res.ok) return null;
    return (await res.json()) as CustomerProfileResponse;
  } catch {
    return null;
  }
}

export class UpdateHotsiteCustomerProfileError extends Error {
  constructor(public readonly status: number) {
    super('Failed to update customer profile');
    this.name = 'UpdateHotsiteCustomerProfileError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export async function updateHotsiteCustomerProfile(body: {
  phone: string;
}): Promise<CustomerProfileResponse> {
  const res = await fetch('/api/customers/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new UpdateHotsiteCustomerProfileError(res.status);

  return (await res.json()) as CustomerProfileResponse;
}
