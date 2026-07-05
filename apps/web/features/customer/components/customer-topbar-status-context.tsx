'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import type { BookingStatus } from '@ikaro/types';

interface CustomerTopbarStatusContextValue {
  readonly bookingStatus: BookingStatus | null;
  readonly setBookingStatus: (status: BookingStatus | null) => void;
  readonly backHrefOverride: string | null;
  readonly setBackHrefOverride: (href: string | null) => void;
  readonly backLabelOverride: string | null;
  readonly setBackLabelOverride: (label: string | null) => void;
}

interface CustomerTopbarStatusProviderProps {
  readonly children: React.ReactNode;
}

const CustomerTopbarStatusContext = createContext<CustomerTopbarStatusContextValue | null>(null);

export function CustomerTopbarStatusProvider({
  children,
}: CustomerTopbarStatusProviderProps): React.JSX.Element {
  const [bookingStatus, setBookingStatus] = useState<BookingStatus | null>(null);
  const [backHrefOverride, setBackHrefOverride] = useState<string | null>(null);
  const [backLabelOverride, setBackLabelOverride] = useState<string | null>(null);
  const value = useMemo(
    () => ({
      bookingStatus,
      setBookingStatus,
      backHrefOverride,
      setBackHrefOverride,
      backLabelOverride,
      setBackLabelOverride,
    }),
    [backHrefOverride, backLabelOverride, bookingStatus],
  );

  return (
    <CustomerTopbarStatusContext.Provider value={value}>
      {children}
    </CustomerTopbarStatusContext.Provider>
  );
}

export function useCustomerTopbarStatus(): CustomerTopbarStatusContextValue | null {
  return useContext(CustomerTopbarStatusContext);
}
