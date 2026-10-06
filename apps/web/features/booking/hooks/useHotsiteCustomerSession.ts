'use client';

import { useEffect, useState } from 'react';
import type { CustomerProfileResponse } from '@ikaro/types';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';

export type HotsiteCustomerSession =
  | { readonly status: 'loading' }
  | { readonly status: 'guest' }
  | { readonly status: 'customer'; readonly profile: CustomerProfileResponse };

// Who is looking at this hotsite page: no session (or one issued for another tenant — the BFF
// answers 401/403 and the fetcher maps both to null) is a guest; a profile is the logged-in
// customer. A network failure counts as a guest so the page offers the login card rather than
// hanging. Same detection BookingForm uses (getHotsiteCustomerProfile), as a standalone hook for
// pages that are not the booking form.
export function useHotsiteCustomerSession(slug: string): HotsiteCustomerSession {
  const [session, setSession] = useState<HotsiteCustomerSession>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const profile = await getHotsiteCustomerProfile(slug);
        if (active) setSession(profile ? { status: 'customer', profile } : { status: 'guest' });
      } catch {
        if (active) setSession({ status: 'guest' });
      }
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  return session;
}
