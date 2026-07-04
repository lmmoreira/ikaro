import { Calendar, Check, Info, X } from 'lucide-react';
import { BOOKING_STATUS, type BookingStatus } from '@ikaro/types';

const ICON_BG: Record<BookingStatus, string> = {
  [BOOKING_STATUS.PENDING]: 'bg-blue-50',
  [BOOKING_STATUS.INFO_REQUESTED]: 'bg-blue-100',
  [BOOKING_STATUS.APPROVED]: 'bg-blue-50',
  [BOOKING_STATUS.REJECTED]: 'bg-red-50',
  [BOOKING_STATUS.CANCELLED]: 'bg-red-50',
  [BOOKING_STATUS.COMPLETED]: 'bg-green-50',
};

const ICON_COLOR: Record<BookingStatus, string> = {
  [BOOKING_STATUS.PENDING]: 'text-blue-600',
  [BOOKING_STATUS.INFO_REQUESTED]: 'text-blue-700',
  [BOOKING_STATUS.APPROVED]: 'text-blue-600',
  [BOOKING_STATUS.REJECTED]: 'text-red-600',
  [BOOKING_STATUS.CANCELLED]: 'text-red-600',
  [BOOKING_STATUS.COMPLETED]: 'text-green-600',
};

const ICON_BY_STATUS: Record<BookingStatus, typeof Calendar> = {
  [BOOKING_STATUS.PENDING]: Calendar,
  [BOOKING_STATUS.INFO_REQUESTED]: Info,
  [BOOKING_STATUS.APPROVED]: Calendar,
  [BOOKING_STATUS.REJECTED]: X,
  [BOOKING_STATUS.CANCELLED]: X,
  [BOOKING_STATUS.COMPLETED]: Check,
};

interface BookingStatusIconProps {
  readonly status: BookingStatus;
}

// Prototype's .booking-item-icon: a 2.125rem square, color-coded per status
// (plan/journey/customer/prototypes/minha-conta/01-minha-conta.html).
export function BookingStatusIcon({ status }: BookingStatusIconProps): React.JSX.Element {
  const Icon = ICON_BY_STATUS[status];
  return (
    <div
      className={`flex h-[2.125rem] w-[2.125rem] shrink-0 items-center justify-center rounded-lg ${ICON_BG[status]}`}
    >
      <Icon className={`h-4 w-4 ${ICON_COLOR[status]}`} aria-hidden="true" />
    </div>
  );
}
