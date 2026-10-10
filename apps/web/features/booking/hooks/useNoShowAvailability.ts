'use client';

import { useEffect, useState } from 'react';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { hasBookingEnded, resolveBookingEnd } from '@/features/booking/model/booking-no-show';

// setTimeout's longest delay; a longer one fires immediately.
const MAX_TIMER_MS = 2_147_483_647;

interface NoShowAvailability {
  // The appointment's end time in the tenant timezone — set while the appointment has not ended
  // (the no-show action is then disabled and shows it as a hint), null once it has.
  readonly noShowAvailableAt: string | null;
  // The same end time, for the 422 banner, which names it whether or not the clock has passed it.
  readonly noShowEndLabel: string;
}

// UC-074 (03c): "Marcar não compareceu" is only available once `scheduledAt + totalDurationMins`
// has passed. The action enables itself when the end time arrives while the page is open.
export function useNoShowAvailability(
  booking: Pick<StaffBookingDetailResponse, 'scheduledAt' | 'totalDurationMins'>,
): NoShowAvailability {
  const { formatTime } = useFormatting();
  const [now, setNow] = useState(() => new Date());
  const { scheduledAt, totalDurationMins } = booking;

  useEffect(() => {
    const remaining = resolveBookingEnd({ scheduledAt, totalDurationMins }).getTime() - Date.now();
    if (remaining <= 0 || remaining > MAX_TIMER_MS) return;
    // +50ms so the callback never reads a clock that is still a hair before the end.
    const timer = setTimeout(() => setNow(new Date()), remaining + 50);
    return () => clearTimeout(timer);
  }, [scheduledAt, totalDurationMins]);

  const noShowEndLabel = formatTime(resolveBookingEnd({ scheduledAt, totalDurationMins }));
  return {
    noShowAvailableAt: hasBookingEnded({ scheduledAt, totalDurationMins }, now)
      ? null
      : noShowEndLabel,
    noShowEndLabel,
  };
}
