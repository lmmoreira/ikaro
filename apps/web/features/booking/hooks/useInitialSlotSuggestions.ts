'use client';

import { useEffect } from 'react';
import type { SlotConflictSuggestion } from '@ikaro/types';
import { fetchBookingAvailability } from '@/features/booking/api/availability';

interface UseInitialSlotSuggestionsParams {
  readonly enabled: boolean;
  readonly tenantSlug: string;
  readonly scheduledAt: string;
  readonly serviceIds: readonly string[];
  readonly errorMessage: string;
  readonly setSlotSuggestions: (slots: readonly SlotConflictSuggestion[]) => void;
  readonly setActionState: (state: 'idle') => void;
  readonly setInlineError: (message: string | null) => void;
  readonly setIsLoading: (loading: boolean) => void;
}

// The approver arrives from the queue shortcut already in the slot-conflict state, so the
// alternatives for the booking's day are fetched on mount.
export function useInitialSlotSuggestions(params: UseInitialSlotSuggestionsParams): void {
  const { enabled, tenantSlug, scheduledAt, serviceIds, errorMessage } = params;
  const { setSlotSuggestions, setActionState, setInlineError, setIsLoading } = params;

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    void (async () => {
      try {
        const day = scheduledAt.slice(0, 10);
        const availability = await fetchBookingAvailability(tenantSlug, day, serviceIds);
        if (active) setSlotSuggestions(availability.slots);
      } catch {
        if (!active) return;
        setActionState('idle');
        setInlineError(errorMessage);
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    enabled,
    errorMessage,
    scheduledAt,
    serviceIds,
    setActionState,
    setInlineError,
    setIsLoading,
    setSlotSuggestions,
    tenantSlug,
  ]);
}
