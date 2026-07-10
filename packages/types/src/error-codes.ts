// Empty per-origin catalogs — populated context-by-context in Wave 2/3/4 of TD23.
// Each union, not just the object, is what error base-class constructors type their
// `code` param against (TD23 §9) — a code outside its origin's union is a compile error.

export const BookingErrorCode = {
  SERVICE_NOT_FOUND: 'BOOKING_SERVICE_NOT_FOUND',
  SERVICE_DEACTIVATED: 'BOOKING_SERVICE_DEACTIVATED',
  CLOSURE_DATE_IN_PAST: 'BOOKING_CLOSURE_DATE_IN_PAST',
  SCHEDULE_CLOSURE_NOT_FOUND: 'BOOKING_SCHEDULE_CLOSURE_NOT_FOUND',
  SCHEDULE_ALREADY_CLOSED: 'BOOKING_SCHEDULE_ALREADY_CLOSED',
  OPENING_DATE_IN_PAST: 'BOOKING_OPENING_DATE_IN_PAST',
  DAY_ALREADY_OPEN_IN_SETTINGS: 'BOOKING_DAY_ALREADY_OPEN_IN_SETTINGS',
  SCHEDULE_OPENING_ALREADY_EXISTS: 'BOOKING_SCHEDULE_OPENING_ALREADY_EXISTS',
  SCHEDULE_OPENING_NOT_FOUND: 'BOOKING_SCHEDULE_OPENING_NOT_FOUND',
  AVAILABILITY_DATE_IN_PAST: 'BOOKING_AVAILABILITY_DATE_IN_PAST',
  AVAILABILITY_RANGE_INVALID: 'BOOKING_AVAILABILITY_RANGE_INVALID',
  NOT_FOUND: 'BOOKING_NOT_FOUND',
  LINE_REQUIRED: 'BOOKING_LINE_REQUIRED',
  PICKUP_ADDRESS_REQUIRED: 'BOOKING_PICKUP_ADDRESS_REQUIRED',
  INVALID_TRANSITION: 'BOOKING_INVALID_TRANSITION',
  SLOT_UNAVAILABLE: 'BOOKING_SLOT_UNAVAILABLE',
  SERVICE_NOT_ACTIVE: 'BOOKING_SERVICE_NOT_ACTIVE',
  SERVICE_NOT_IN_TENANT: 'BOOKING_SERVICE_NOT_IN_TENANT',
  CANCELLATION_WINDOW_EXPIRED: 'BOOKING_CANCELLATION_WINDOW_EXPIRED',
  CUSTOMER_NOT_FOUND: 'BOOKING_CUSTOMER_NOT_FOUND',
  CUSTOMER_PHONE_NOT_SET: 'BOOKING_CUSTOMER_PHONE_NOT_SET',
  REJECTION_REASON_TOO_SHORT: 'BOOKING_REJECTION_REASON_TOO_SHORT',
  INFO_MESSAGE_TOO_SHORT: 'BOOKING_INFO_MESSAGE_TOO_SHORT',
  FORBIDDEN: 'BOOKING_FORBIDDEN',
  SCHEDULED_IN_PAST: 'BOOKING_SCHEDULED_IN_PAST',
  SCHEDULED_AT_INVALID: 'BOOKING_SCHEDULED_AT_INVALID',
  COMPLETE_LINES_INCOMPLETE: 'BOOKING_COMPLETE_LINES_INCOMPLETE',
  PHOTO_NOT_UPLOADED: 'BOOKING_PHOTO_NOT_UPLOADED',
  DISCOUNT_NOT_AVAILABLE: 'BOOKING_DISCOUNT_NOT_AVAILABLE',
  DISCOUNT_DISABLED: 'BOOKING_DISCOUNT_DISABLED',
  DISCOUNT_MISMATCH: 'BOOKING_DISCOUNT_MISMATCH',
  DISCOUNT_EXCEEDS_TOTAL: 'BOOKING_DISCOUNT_EXCEEDS_TOTAL',
  TENANT_ID_REQUIRED: 'BOOKING_TENANT_ID_REQUIRED',
  CREATED_BY_REQUIRED: 'BOOKING_CREATED_BY_REQUIRED',
  SERVICE_NAME_REQUIRED: 'BOOKING_SERVICE_NAME_REQUIRED',
  SERVICE_PRICE_INVALID: 'BOOKING_SERVICE_PRICE_INVALID',
  SERVICE_DURATION_INVALID: 'BOOKING_SERVICE_DURATION_INVALID',
  SERVICE_LOYALTY_POINTS_INVALID: 'BOOKING_SERVICE_LOYALTY_POINTS_INVALID',
  CLOSURE_REASON_INVALID: 'BOOKING_CLOSURE_REASON_INVALID',
  CLOSURE_TIME_RANGE_INCOMPLETE: 'BOOKING_CLOSURE_TIME_RANGE_INCOMPLETE',
  TIME_RANGE_FORMAT_INVALID: 'BOOKING_TIME_RANGE_FORMAT_INVALID',
  TIME_RANGE_ORDER_INVALID: 'BOOKING_TIME_RANGE_ORDER_INVALID',
} as const;
export type BookingErrorCode = (typeof BookingErrorCode)[keyof typeof BookingErrorCode];

export const CustomerErrorCode = {} as const;
export type CustomerErrorCode = (typeof CustomerErrorCode)[keyof typeof CustomerErrorCode];

export const StaffErrorCode = {} as const;
export type StaffErrorCode = (typeof StaffErrorCode)[keyof typeof StaffErrorCode];

export const LoyaltyErrorCode = {} as const;
export type LoyaltyErrorCode = (typeof LoyaltyErrorCode)[keyof typeof LoyaltyErrorCode];

export const PlatformErrorCode = {} as const;
export type PlatformErrorCode = (typeof PlatformErrorCode)[keyof typeof PlatformErrorCode];

export const AddressErrorCode = {
  POSTAL_CODE_INVALID: 'ADDRESS_POSTAL_CODE_INVALID',
  STATE_INVALID: 'ADDRESS_STATE_INVALID',
  NEIGHBORHOOD_REQUIRED: 'ADDRESS_NEIGHBORHOOD_REQUIRED',
  FIELD_REQUIRED: 'ADDRESS_FIELD_REQUIRED',
} as const;
export type AddressErrorCode = (typeof AddressErrorCode)[keyof typeof AddressErrorCode];

export const CountryCodeErrorCode = {
  FORMAT_INVALID: 'COUNTRY_CODE_FORMAT_INVALID',
  UNSUPPORTED: 'COUNTRY_CODE_UNSUPPORTED',
} as const;
export type CountryCodeErrorCode = (typeof CountryCodeErrorCode)[keyof typeof CountryCodeErrorCode];

export const PhoneErrorCode = {} as const;
export type PhoneErrorCode = (typeof PhoneErrorCode)[keyof typeof PhoneErrorCode];

export const MoneyErrorCode = {} as const;
export type MoneyErrorCode = (typeof MoneyErrorCode)[keyof typeof MoneyErrorCode];

export const SeoErrorCode = {} as const;
export type SeoErrorCode = (typeof SeoErrorCode)[keyof typeof SeoErrorCode];

export const SlugErrorCode = {} as const;
export type SlugErrorCode = (typeof SlugErrorCode)[keyof typeof SlugErrorCode];

export const HexColorErrorCode = {} as const;
export type HexColorErrorCode = (typeof HexColorErrorCode)[keyof typeof HexColorErrorCode];

export const TimezoneErrorCode = {} as const;
export type TimezoneErrorCode = (typeof TimezoneErrorCode)[keyof typeof TimezoneErrorCode];

export const TimeOfDayErrorCode = {} as const;
export type TimeOfDayErrorCode = (typeof TimeOfDayErrorCode)[keyof typeof TimeOfDayErrorCode];

export const EmailErrorCode = {} as const;
export type EmailErrorCode = (typeof EmailErrorCode)[keyof typeof EmailErrorCode];

export const BffErrorCode = {} as const;
export type BffErrorCode = (typeof BffErrorCode)[keyof typeof BffErrorCode];

export const GenericErrorCode = {} as const;
export type GenericErrorCode = (typeof GenericErrorCode)[keyof typeof GenericErrorCode];
