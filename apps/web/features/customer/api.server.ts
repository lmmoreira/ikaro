import { redirect } from 'next/navigation';
import type { CustomerProfileResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { CustomerFetchError } from '@/shared/lib/api/errors';

// A tenant customer's profile for the staff booking flow (STAFF | MANAGER): the name and contact
// the steps show, and the saved address a pickup service starts with. Null when the customer does
// not exist in this tenant, so a stale link returns to the chooser instead of a 404 page.
export async function fetchCustomerProfileForStaff(
  token: string,
  customerId: string,
): Promise<CustomerProfileResponse | null> {
  const res = await bffServerFetch(token, `/customers/${customerId}`);
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Failed to fetch customer (${res.status})`);
  return res.json() as Promise<CustomerProfileResponse>;
}

// Wraps a my-account page's BFF read: an expired/invalid session (401) or a tenant/actor
// mismatch (403) redirects to login instead of falling through to the generic error boundary.
// Any other failure (network error, 500) rethrows for MyAccountRouteError to catch.
export async function withAuthRedirect<T>(promise: Promise<T>, tenantSlug: string): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof CustomerFetchError && (err.status === 401 || err.status === 403)) {
      redirect(`/${tenantSlug}/login`);
    }
    throw err;
  }
}
