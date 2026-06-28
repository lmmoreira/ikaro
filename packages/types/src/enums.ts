export const BOOKING_STATUS = {
  PENDING: 'PENDING',
  INFO_REQUESTED: 'INFO_REQUESTED',
  APPROVED: 'APPROVED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];

export type BookingType = 'GUEST' | 'CUSTOMER';

export type StaffRole = 'MANAGER' | 'STAFF';

export type ClosureReason = 'STAFF_DAY_OFF' | 'MAINTENANCE' | 'HOLIDAY';

export type HotsiteModuleType =
  | 'HERO'
  | 'SERVICE_LIST'
  | 'GALLERY'
  | 'TESTIMONIALS'
  | 'BOOKING_CTA'
  | 'ABOUT'
  | 'CONTACT'
  | 'FOOTER';
