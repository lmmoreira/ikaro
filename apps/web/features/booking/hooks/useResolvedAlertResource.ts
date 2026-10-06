'use client';

import { useEffect, useState } from 'react';
import { fetchServiceResourceOptions } from '@/features/booking/api/public';

export type AlertResourceState =
  | { readonly status: 'none' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly id: string; readonly name: string };

// The booking flow passes only the id of its single resource pick in the alert link, so the name
// to show comes from the service's public resource options. An id the service does not actually
// offer, or options that cannot be read, resolve to "none" — the alert then goes out without a
// preferred resource instead of carrying an unverified one. A legged service never has one: its
// picks are per leg, which one preferred resource cannot represent.
export function useResolvedAlertResource(
  slug: string,
  serviceId: string,
  preferredResourceId: string | null,
  hasLegs: boolean,
): AlertResourceState {
  const wanted = hasLegs ? null : preferredResourceId;
  const [state, setState] = useState<AlertResourceState>(
    wanted ? { status: 'loading' } : { status: 'none' },
  );

  useEffect(() => {
    if (!wanted) return;
    let active = true;
    fetchServiceResourceOptions(slug, serviceId)
      .then((response) => {
        if (!active) return;
        const option = response.requirements
          .flatMap((requirement) => requirement.options)
          .find((candidate) => candidate.resourceId === wanted);
        setState(
          option
            ? { status: 'ready', id: option.resourceId, name: option.name }
            : { status: 'none' },
        );
      })
      .catch(() => active && setState({ status: 'none' }));
    return () => {
      active = false;
    };
  }, [slug, serviceId, wanted]);

  return wanted ? state : { status: 'none' };
}
