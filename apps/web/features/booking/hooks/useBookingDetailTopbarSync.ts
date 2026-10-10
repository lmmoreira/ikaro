'use client';

import { useEffect } from 'react';
import type { BookingStatus } from '@ikaro/types';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';

// Keeps the dashboard topbar's status chip and back link in step with the booking detail page and
// clears both when the page unmounts (extracted from BookingDetailPage for the file-length cap).
export function useBookingDetailTopbarSync(status: BookingStatus, returnTo: string | null): void {
  const topbarStatus = useDashboardTopbarStatus();
  const setBookingStatus = topbarStatus?.setBookingStatus;
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;

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
