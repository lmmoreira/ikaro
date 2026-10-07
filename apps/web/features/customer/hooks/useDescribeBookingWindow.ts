'use client';

import { useFormatting } from '@/shared/lib/formatting/use-formatting';

export interface BookingWindowFacts {
  readonly start: Date;
  readonly end: Date;
}

export function useDescribeBookingWindow(): (window: BookingWindowFacts) => string {
  const { formatDateLong, formatTime } = useFormatting();

  return ({ start, end }) => `${formatDateLong(start)} · ${formatTime(start)}–${formatTime(end)}`;
}
