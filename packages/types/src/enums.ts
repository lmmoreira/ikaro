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

// The full set of actor kinds a request can be authenticated as — CUSTOMER, or either Staff
// role. Broader than StaffRole (which only describes the Staff aggregate's own role field);
// this is the request/session-level classification carried in the JWT (BFF) and forwarded via
// the X-Actor-Role header (backend), so both apps compare against one canonical set.
export const ACTOR_ROLES = ['CUSTOMER', 'STAFF', 'MANAGER'] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export type ClosureReason = 'STAFF_DAY_OFF' | 'MAINTENANCE' | 'HOLIDAY';

export type HotsiteModuleType =
  | 'HERO'
  | 'SERVICE_LIST'
  | 'GALLERY'
  | 'TESTIMONIALS'
  | 'BOOKING_CTA'
  | 'ABOUT'
  | 'CONTACT'
  | 'FOOTER'
  | 'CHATBOT';
