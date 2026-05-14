export type BookingStatus =
  | 'PENDING'
  | 'INFO_REQUESTED'
  | 'APPROVED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

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
  | 'CONTACT';
