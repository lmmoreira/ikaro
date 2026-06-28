'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import type { BookingStatus } from '@ikaro/types';

interface DashboardTopbarStatusContextValue {
  readonly bookingStatus: BookingStatus | null;
  readonly setBookingStatus: (status: BookingStatus | null) => void;
}

interface DashboardTopbarStatusProviderProps {
  readonly initialBookingStatus?: BookingStatus | null;
  readonly children: React.ReactNode;
}

const DashboardTopbarStatusContext = createContext<DashboardTopbarStatusContextValue | null>(null);

export function DashboardTopbarStatusProvider({
  initialBookingStatus = null,
  children,
}: DashboardTopbarStatusProviderProps): React.JSX.Element {
  const [bookingStatus, setBookingStatus] = useState<BookingStatus | null>(initialBookingStatus);
  const value = useMemo(
    () => ({
      bookingStatus,
      setBookingStatus,
    }),
    [bookingStatus, setBookingStatus],
  );

  return (
    <DashboardTopbarStatusContext.Provider value={value}>
      {children}
    </DashboardTopbarStatusContext.Provider>
  );
}

export function useDashboardTopbarStatus(): DashboardTopbarStatusContextValue | null {
  return useContext(DashboardTopbarStatusContext);
}
