import { redirect } from 'next/navigation';
import { FetchError } from '@/shared/lib/api/errors';

export class CustomerFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(`Customer request failed (${status})`, status, code, field, detail);
    this.name = 'CustomerFetchError';
  }
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
