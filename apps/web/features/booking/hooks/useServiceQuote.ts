'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HotsiteServiceQuoteResponse } from '@ikaro/types';
import { fetchServiceQuote } from '@/features/booking/api/public';

export type ServiceQuoteState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly quote: HotsiteServiceQuoteResponse };

interface Stored {
  readonly key: string;
  readonly state: ServiceQuoteState;
}

/**
 * The server's quote for one service at the chosen duration (`GET /public/services/:id/quote`) —
 * exactly what booking creation will persist. Re-requested on every change of duration; a failed
 * request stays failed until `retry()` (the step fails closed — a duration without a quote is
 * never submitted blind). A stale response for a duration the customer has since left is dropped.
 */
export function useServiceQuote(
  slug: string,
  serviceId: string,
  durationMinutes: number | null,
): { readonly state: ServiceQuoteState; readonly retry: () => void } {
  const [stored, setStored] = useState<Stored | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${slug}:${serviceId}:${durationMinutes ?? ''}:${attempt}`;

  useEffect(() => {
    if (durationMinutes === null) return;
    let active = true;
    fetchServiceQuote(slug, serviceId, durationMinutes)
      .then((quote) => active && setStored({ key, state: { status: 'ready', quote } }))
      .catch(() => active && setStored({ key, state: { status: 'error' } }));
    return () => {
      active = false;
    };
  }, [slug, serviceId, durationMinutes, key]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  let state: ServiceQuoteState = { status: 'loading' };
  if (durationMinutes === null) state = { status: 'idle' };
  else if (stored?.key === key) state = stored.state;
  return { state, retry };
}
