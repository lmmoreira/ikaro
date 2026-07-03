import { BOOKING_STATUS, type BookingStatus } from '@ikaro/types';

type BookingStatusTranslationKey =
  | 'statusPending'
  | 'statusInfoRequested'
  | 'statusApproved'
  | 'statusRejected'
  | 'statusCancelled'
  | 'statusCompleted';

type TranslateFn = (key: BookingStatusTranslationKey) => string;

export const BOOKING_STATUS_CLASSES: Record<BookingStatus, string> = {
  [BOOKING_STATUS.PENDING]: 'bg-yellow-100 text-yellow-800',
  [BOOKING_STATUS.INFO_REQUESTED]: 'bg-blue-100 text-blue-800',
  [BOOKING_STATUS.APPROVED]: 'bg-green-100 text-green-800',
  [BOOKING_STATUS.REJECTED]: 'bg-red-100 text-red-800',
  [BOOKING_STATUS.CANCELLED]: 'bg-gray-100 text-gray-600',
  [BOOKING_STATUS.COMPLETED]: 'bg-slate-100 text-slate-600',
};

export const SCHEDULE_BOOKING_STATUS_DEFAULT: readonly BookingStatus[] = [
  BOOKING_STATUS.INFO_REQUESTED,
  BOOKING_STATUS.APPROVED,
  BOOKING_STATUS.REJECTED,
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.COMPLETED,
];

export const SCHEDULE_BOOKING_STATUS_OPTIONS: readonly BookingStatus[] = [
  BOOKING_STATUS.PENDING,
  ...SCHEDULE_BOOKING_STATUS_DEFAULT,
];

export const SCHEDULE_BOOKING_STATUS_FILTER = SCHEDULE_BOOKING_STATUS_DEFAULT.join(',');
export const SCHEDULE_BOOKING_STATUS_ALL = SCHEDULE_BOOKING_STATUS_OPTIONS.join(',');

export function buildBookingStatusLabels(t: TranslateFn): Record<BookingStatus, string> {
  return {
    [BOOKING_STATUS.PENDING]: t('statusPending'),
    [BOOKING_STATUS.INFO_REQUESTED]: t('statusInfoRequested'),
    [BOOKING_STATUS.APPROVED]: t('statusApproved'),
    [BOOKING_STATUS.REJECTED]: t('statusRejected'),
    [BOOKING_STATUS.CANCELLED]: t('statusCancelled'),
    [BOOKING_STATUS.COMPLETED]: t('statusCompleted'),
  };
}
