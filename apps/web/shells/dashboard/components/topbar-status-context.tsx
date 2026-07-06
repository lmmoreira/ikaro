'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import type { BookingStatus, StaffRole } from '@ikaro/types';

export type DashboardServiceStatus = 'ACTIVE' | 'INACTIVE';

interface DashboardTopbarStatusContextValue {
  readonly bookingStatus: BookingStatus | null;
  readonly setBookingStatus: (status: BookingStatus | null) => void;
  readonly serviceStatus: DashboardServiceStatus | null;
  readonly setServiceStatus: (status: DashboardServiceStatus | null) => void;
  readonly staffRoleStatus: StaffRole | null;
  readonly setStaffRoleStatus: (status: StaffRole | null) => void;
  readonly backHrefOverride: string | null;
  readonly setBackHrefOverride: (href: string | null) => void;
  readonly backLabelOverride: string | null;
  readonly setBackLabelOverride: (label: string | null) => void;
  readonly pageTitleOverride: string | null;
  readonly setPageTitleOverride: (title: string | null) => void;
}

interface DashboardTopbarStatusProviderProps {
  readonly initialBookingStatus?: BookingStatus | null;
  readonly initialServiceStatus?: DashboardServiceStatus | null;
  readonly initialStaffRoleStatus?: StaffRole | null;
  readonly children: React.ReactNode;
}

const DashboardTopbarStatusContext = createContext<DashboardTopbarStatusContextValue | null>(null);

export function DashboardTopbarStatusProvider({
  initialBookingStatus = null,
  initialServiceStatus = null,
  initialStaffRoleStatus = null,
  children,
}: DashboardTopbarStatusProviderProps): React.JSX.Element {
  const [bookingStatus, setBookingStatus] = useState<BookingStatus | null>(initialBookingStatus);
  const [serviceStatus, setServiceStatus] = useState<DashboardServiceStatus | null>(
    initialServiceStatus,
  );
  const [staffRoleStatus, setStaffRoleStatus] = useState<StaffRole | null>(initialStaffRoleStatus);
  const [backHrefOverride, setBackHrefOverride] = useState<string | null>(null);
  const [backLabelOverride, setBackLabelOverride] = useState<string | null>(null);
  const [pageTitleOverride, setPageTitleOverride] = useState<string | null>(null);
  const value = useMemo(
    () => ({
      bookingStatus,
      setBookingStatus,
      serviceStatus,
      setServiceStatus,
      staffRoleStatus,
      setStaffRoleStatus,
      backHrefOverride,
      setBackHrefOverride,
      backLabelOverride,
      setBackLabelOverride,
      pageTitleOverride,
      setPageTitleOverride,
    }),
    [
      backHrefOverride,
      backLabelOverride,
      bookingStatus,
      pageTitleOverride,
      serviceStatus,
      staffRoleStatus,
      setBookingStatus,
      setBackHrefOverride,
      setBackLabelOverride,
      setPageTitleOverride,
      setServiceStatus,
      setStaffRoleStatus,
    ],
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
