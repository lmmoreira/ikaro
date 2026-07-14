import type { Address, CustomerProfileResponse } from '@ikaro/types';
import { assertOk, FetchError } from '@/shared/lib/api/errors';

// Distinct from lib/api/customer.ts's getCustomerProfile()/updateCustomerProfile():
// those call the Bearer-token bffClient (only configured inside an authenticated dashboard
// shell). These read/write the httpOnly cookie server-side via the /api/customers/me proxy —
// for contexts like the public hotsite where no dashboard shell (and no in-memory token)
// exists yet.
// `slug` is the hotsite currently being viewed — forwarded so the BFF's TenantGuard can reject
// a JWT issued for a *different* tenant. Without it, a customer authenticated at tenant A who
// navigates to tenant B's hotsite would silently see tenant A's profile rendered as "logged in"
// on tenant B's page. A 403 (mismatch) is treated the same as a 401 (unauthenticated) — both
// resolve to "not logged in here".
export class FetchCustomerProfileError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(`Failed to fetch customer profile (${status})`, status, code, field, detail);
    this.name = 'FetchCustomerProfileError';
  }
}

export async function getHotsiteCustomerProfile(
  slug: string,
): Promise<CustomerProfileResponse | null> {
  try {
    const res = await fetch(`/api/customers/me?slug=${encodeURIComponent(slug)}`);
    if (res.status === 401 || res.status === 403) return null;
    await assertOk(res, FetchCustomerProfileError);
    return (await res.json()) as CustomerProfileResponse;
  } catch (err) {
    if (err instanceof FetchCustomerProfileError) throw err;
    return null; // network error — treat as unauthenticated
  }
}

// Mirrors the canonical `ValidationViolation` shape (`@ikaro/types`'s errors.dto.ts) — the BFF's
// ZodValidationPipe never sends a per-violation `message`, only `field`/`code`/`params`. Kept as
// a local interface (not an import) so this file doesn't pull in the NestJS-adjacent errors.dto
// barrel from a `platform/hotsite` client module.
export interface UpdateCustomerProfileViolation {
  readonly field: string;
  readonly code: string;
  readonly params?: Record<string, string | number>;
}

export class UpdateHotsiteCustomerProfileError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
    public readonly field?: string,
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
    // Two distinct error shapes can arrive here: a top-level `code`/`field` from a backend
    // domain/VO validation failure (e.g. CustomerAddressValidationError, field: 'contactAddress'),
    // or a `violations[]` array from the BFF's Zod required-field checks. Both are read — a
    // single-cause failure never populates `violations`, and vice versa.
    const parsed = (await res.json().catch(() => null)) as {
      code?: string;
      field?: string;
      violations?: UpdateCustomerProfileViolation[];
    } | null;
    throw new UpdateHotsiteCustomerProfileError(
      res.status,
      parsed?.code,
      parsed?.field,
      parsed?.violations ?? [],
    );
  }

  return (await res.json()) as CustomerProfileResponse;
}
