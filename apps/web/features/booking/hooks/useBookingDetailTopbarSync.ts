'use client';

import { useEffect } from 'react';
import type { BookingStatus } from '@ikaro/types';

// The two topbar setters this hook drives. The page passes the dashboard topbar context's value
// (it satisfies this shape), so the hook never imports from a components/ directory.
export interface BookingDetailTopbarHandle {
  readonly setBookingStatus?: (status: BookingStatus | null) => void;
  readonly setBackHrefOverride?: (href: string | null) => void;
}

// Keeps the dashboard topbar's status chip and back link in step with the booking detail page and
// clears both when the page unmounts (extracted from BookingDetailPage for the file-length cap).
export function useBookingDetailTopbarSync(
  status: BookingStatus,
  returnTo: string | null,
  topbar: BookingDetailTopbarHandle | null,
): void {
  const setBookingStatus = topbar?.setBookingStatus;
  const setBackHrefOverride = topbar?.setBackHrefOverride;

  useEffect(() => {
    setBookingStatus?.(status);
  }, [status, setBookingStatus]);

  useEffect(() => {
    setBackHrefOverride?.(returnTo);
    return () => {
      setBackHrefOverride?.(null);
    };
  }, [returnTo, setBackHrefOverride]);

  useEffect(
    () => () => {
      setBookingStatus?.(null);
    },
    [setBookingStatus],
  );
}
