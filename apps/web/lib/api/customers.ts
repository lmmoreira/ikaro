import type { Address, CustomerProfileResponse } from '@ikaro/types';

// Distinct from lib/api/dashboard/customers.ts's getCustomerProfile()/updateCustomerProfile():
// those call the Bearer-token bffClient (only configured inside an authenticated dashboard
// shell). These read/write the httpOnly cookie server-side via the /api/customers/me proxy —
// for contexts like the public hotsite where no dashboard shell (and no in-memory token)
// exists yet.
// `slug` is the hotsite currently being viewed — forwarded so the BFF's TenantGuard can reject
// a JWT issued for a *different* tenant. Without it, a customer authenticated at tenant A who
// navigates to tenant B's hotsite would silently see tenant A's profile rendered as "logged in"
// on tenant B's page. A 403 (mismatch) is treated the same as a 401 (unauthenticated) — both
// resolve to "not logged in here".
export async function getHotsiteCustomerProfile(
  slug: string,
): Promise<CustomerProfileResponse | null> {
  try {
    const res = await fetch(`/api/customers/me?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    return (await res.json()) as CustomerProfileResponse;
  } catch {
    return null;
  }
}

export interface UpdateCustomerProfileViolation {
  readonly field: string;
  readonly message: string;
}

export class UpdateHotsiteCustomerProfileError extends Error {
  constructor(
    public readonly status: number,
    public readonly violations: readonly UpdateCustomerProfileViolation[] = [],
  ) {
    super('Failed to update customer profile');
    this.name = 'UpdateHotsiteCustomerProfileError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export async function updateHotsiteCustomerProfile(
  slug: string,
  body: {
    phone: string;
    defaultAddress: Address;
  },
): Promise<CustomerProfileResponse> {
  const res = await fetch(`/api/customers/me?slug=${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const violations = (await res.json().catch(() => null)) as {
      violations?: UpdateCustomerProfileViolation[];
    } | null;
    throw new UpdateHotsiteCustomerProfileError(res.status, violations?.violations ?? []);
  }

  return (await res.json()) as CustomerProfileResponse;
}
