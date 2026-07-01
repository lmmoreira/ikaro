'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import type { BookingStatus } from '@ikaro/types';

export type DashboardServiceStatus = 'ACTIVE' | 'INACTIVE';

interface DashboardTopbarStatusContextValue {
  readonly bookingStatus: BookingStatus | null;
  readonly setBookingStatus: (status: BookingStatus | null) => void;
  readonly serviceStatus: DashboardServiceStatus | null;
  readonly setServiceStatus: (status: DashboardServiceStatus | null) => void;
}

interface DashboardTopbarStatusProviderProps {
  readonly initialBookingStatus?: BookingStatus | null;
  readonly initialServiceStatus?: DashboardServiceStatus | null;
  readonly children: React.ReactNode;
}

const DashboardTopbarStatusContext = createContext<DashboardTopbarStatusContextValue | null>(null);

export function DashboardTopbarStatusProvider({
  initialBookingStatus = null,
  initialServiceStatus = null,
  children,
}: DashboardTopbarStatusProviderProps): React.JSX.Element {
  const [bookingStatus, setBookingStatus] = useState<BookingStatus | null>(initialBookingStatus);
  const [serviceStatus, setServiceStatus] = useState<DashboardServiceStatus | null>(
    initialServiceStatus,
  );
  const value = useMemo(
    () => ({
      bookingStatus,
      setBookingStatus,
      serviceStatus,
      setServiceStatus,
    }),
    [bookingStatus, serviceStatus, setBookingStatus, setServiceStatus],
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
