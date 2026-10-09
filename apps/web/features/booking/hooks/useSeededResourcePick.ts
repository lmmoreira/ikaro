'use client';

import { useRef } from 'react';
import type { HotsiteServiceResourceOptionsRequirement } from '@ikaro/types';
import {
  seededResourcePick,
  type BookingDeepLinkSeed,
} from '@/features/booking/model/booking-deep-link';
import type { BookingSelections } from './useBookingSelections';

// The availability-alert link's preferred resource, as the first pick, once the options say the
// service still offers it. A pick needs the requirement's resource type, which only the loaded
// options know. It is tried once, on the first "Próximo" with the link's service alone selected —
// a customer who has since changed the selection or picked a resource keeps their own choice.
export function useSeededResourcePick(
  selections: BookingSelections,
  seed: BookingDeepLinkSeed | null,
) {
  const tried = useRef(false);
  return (requirements: readonly HotsiteServiceResourceOptionsRequirement[]): void => {
    const [only, ...rest] = selections.selectedServiceIds;
    if (tried.current || !seed?.resourceId || only !== seed.serviceId || rest.length > 0) return;
    tried.current = true;
    if (selections.picks.length > 0) return;
    const pick = seededResourcePick(requirements, seed.serviceId, seed.resourceId);
    if (pick) selections.setPicks([pick]);
  };
}
