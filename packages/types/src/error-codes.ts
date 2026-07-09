// Empty per-origin catalogs — populated context-by-context in Wave 2/3/4 of TD23.
// Each union, not just the object, is what error base-class constructors type their
// `code` param against (TD23 §9) — a code outside its origin's union is a compile error.

export const BookingErrorCode = {} as const;
export type BookingErrorCode = (typeof BookingErrorCode)[keyof typeof BookingErrorCode];

export const CustomerErrorCode = {} as const;
export type CustomerErrorCode = (typeof CustomerErrorCode)[keyof typeof CustomerErrorCode];

export const StaffErrorCode = {} as const;
export type StaffErrorCode = (typeof StaffErrorCode)[keyof typeof StaffErrorCode];

export const LoyaltyErrorCode = {} as const;
export type LoyaltyErrorCode = (typeof LoyaltyErrorCode)[keyof typeof LoyaltyErrorCode];

export const PlatformErrorCode = {} as const;
export type PlatformErrorCode = (typeof PlatformErrorCode)[keyof typeof PlatformErrorCode];

export const AddressErrorCode = {} as const;
export type AddressErrorCode = (typeof AddressErrorCode)[keyof typeof AddressErrorCode];

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
