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
