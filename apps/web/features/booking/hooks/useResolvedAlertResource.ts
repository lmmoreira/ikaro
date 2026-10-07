'use client';

import { useEffect, useState } from 'react';
import { fetchServiceResourceOptions } from '@/features/booking/api/public';

export type AlertResourceState =
  | { readonly status: 'none' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly id: string; readonly name: string };

interface ResolvedAlertResource {
  readonly resource: AlertResourceState;
  readonly retry: () => void;
}

// The booking flow passes only the id of its single resource pick in the alert link, so the name
// to show comes from the service's public resource options.
// - An id the service does not actually offer (a stale or hand-typed link) resolves to "none": the
//   alert goes out without a preferred resource.
// - A failed read is an "error", never "none": silently dropping the pick would broaden the
//   customer's request to any resource, so the form keeps submit disabled and offers a retry.
// A legged service or a bundle never has one: its picks are per leg/requirement, which one
// preferred resource cannot represent.
export function useResolvedAlertResource(
  slug: string,
  serviceId: string,
  preferredResourceId: string | null,
  isComposite: boolean,
): ResolvedAlertResource {
  const wanted = isComposite ? null : preferredResourceId;
  const [state, setState] = useState<AlertResourceState>(
    wanted ? { status: 'loading' } : { status: 'none' },
  );
  const [attempt, setAttempt] = useState(0);

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
      .catch(() => active && setState({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [slug, serviceId, wanted, attempt]);

  const retry = (): void => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  };

  return { resource: wanted ? state : { status: 'none' }, retry };
}
