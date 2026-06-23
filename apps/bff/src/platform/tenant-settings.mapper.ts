import {
  TenantBookingSettings,
  TenantBusinessHours,
  TenantBusinessInfo,
  TenantBusinessInfoAddress,
  TenantDayHours,
  TenantLocalizationSettings,
  TenantLoyaltySettings,
  TenantNotificationSettings,
  TenantSettingsResponse,
  TenantSocialLinks,
} from '@ikaro/types';
import {
  RawBookingSettings,
  RawBusinessHours,
  RawBusinessInfo,
  RawBusinessInfoAddress,
  RawDayHours,
  RawLocalizationSettings,
  RawLoyaltySettings,
  RawNotificationSettings,
  RawSocialLinks,
  RawTenantSettingsResponse,
} from './tenant-settings.types';

// Mirrors what UpdateTenantSettingsBodySchema (Zod) actually produces — deeper
// partiality than Partial<TenantSettings> allows, since businessInfo's nested
// address/socialLinks fields are each independently optional and nullable too.
export interface TenantBusinessInfoAddressUpdateInput {
  street?: string | null;
  number?: string | null;
  complement?: string;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

export interface TenantSocialLinksUpdateInput {
  whatsapp?: string | null;
  instagram?: string | null;
  facebook?: string | null;
}

export interface TenantSettingsUpdateInput {
  loyalty?: Partial<TenantLoyaltySettings>;
  booking?: Partial<TenantBookingSettings>;
  businessHours?: Partial<TenantBusinessHours>;
  localization?: Partial<TenantLocalizationSettings>;
  businessInfo?: {
    phone?: string | null;
    email?: string | null;
    address?: TenantBusinessInfoAddressUpdateInput | null;
    socialLinks?: TenantSocialLinksUpdateInput | null;
  };
}

interface RawBusinessInfoAddressUpdate {
  street?: string | null;
  number?: string | null;
  complement?: string;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

interface RawSocialLinksUpdate {
  whatsapp?: string | null;
  instagram?: string | null;
  facebook?: string | null;
}

interface RawBusinessInfoUpdate {
  phone?: string | null;
  email?: string | null;
  address?: RawBusinessInfoAddressUpdate | null;
  social_links?: RawSocialLinksUpdate | null;
}

export interface RawTenantSettingsUpdate {
  loyalty?: Partial<RawLoyaltySettings>;
  booking?: Partial<RawBookingSettings>;
  business_hours?: Partial<RawBusinessHours>;
  localization?: Partial<RawLocalizationSettings>;
  business_info?: RawBusinessInfoUpdate;
}

function toLoyalty(raw: RawLoyaltySettings): TenantLoyaltySettings {
  return {
    expiryDays: raw.expiry_days,
    enableNotifications: raw.enable_notifications,
    expiryWarningDays: raw.expiry_warning_days,
    notificationMinPoints: raw.notification_min_points,
    pointsPerCurrencyUnit: raw.points_per_currency_unit,
  };
}

function toBooking(raw: RawBookingSettings): TenantBookingSettings {
  return {
    cancellationWindowHours: raw.cancellation_window_hours,
    autoApproveEnabled: raw.auto_approve_enabled,
    minBookingAdvanceHours: raw.min_booking_advance_hours,
    maxBookingAdvanceDays: raw.max_booking_advance_days,
    serviceBufferMinutes: raw.service_buffer_minutes,
    slotGranularityMinutes: raw.slot_granularity_minutes,
  };
}

function toBusinessHours(raw: RawBusinessHours): TenantBusinessHours {
  return {
    timezone: raw.timezone,
    monday: raw.monday,
    tuesday: raw.tuesday,
    wednesday: raw.wednesday,
    thursday: raw.thursday,
    friday: raw.friday,
    saturday: raw.saturday,
    sunday: raw.sunday,
  };
}

function toLocalization(raw: RawLocalizationSettings): TenantLocalizationSettings {
  return {
    countryCode: raw.country_code,
    currency: raw.currency,
    currencySymbol: raw.currency_symbol,
    language: raw.language,
    decimalPlaces: raw.decimal_places,
  };
}

function toBusinessInfoAddress(raw: RawBusinessInfoAddress): TenantBusinessInfoAddress {
  return {
    street: raw.street,
    number: raw.number,
    complement: raw.complement,
    neighborhood: raw.neighborhood,
    city: raw.city,
    state: raw.state,
    zipCode: raw.zip_code,
  };
}

function toSocialLinks(raw: RawSocialLinks): TenantSocialLinks {
  return { whatsapp: raw.whatsapp, instagram: raw.instagram, facebook: raw.facebook };
}

function toBusinessInfo(raw: RawBusinessInfo): TenantBusinessInfo {
  return {
    phone: raw.phone,
    email: raw.email,
    address: raw.address ? toBusinessInfoAddress(raw.address) : null,
    socialLinks: raw.social_links ? toSocialLinks(raw.social_links) : null,
  };
}

function toNotification(raw: RawNotificationSettings): TenantNotificationSettings {
  return { fromEmail: raw.from_email };
}

export function toTenantSettingsResponse(raw: RawTenantSettingsResponse): TenantSettingsResponse {
  return {
    tenantId: raw.tenantId,
    name: raw.name,
    slug: raw.slug,
    loyalty: toLoyalty(raw.settings.loyalty),
    booking: toBooking(raw.settings.booking),
    businessHours: toBusinessHours(raw.settings.business_hours),
    localization: toLocalization(raw.settings.localization),
    notification: raw.settings.notification ? toNotification(raw.settings.notification) : undefined,
    businessInfo: raw.settings.business_info
      ? toBusinessInfo(raw.settings.business_info)
      : undefined,
  };
}

function loyaltyToBackend(l: Partial<TenantLoyaltySettings>): Partial<RawLoyaltySettings> {
  const out: Partial<RawLoyaltySettings> = {};
  if (l.expiryDays !== undefined) out.expiry_days = l.expiryDays;
  if (l.enableNotifications !== undefined) out.enable_notifications = l.enableNotifications;
  if (l.expiryWarningDays !== undefined) out.expiry_warning_days = l.expiryWarningDays;
  if (l.notificationMinPoints !== undefined) out.notification_min_points = l.notificationMinPoints;
  if (l.pointsPerCurrencyUnit !== undefined) out.points_per_currency_unit = l.pointsPerCurrencyUnit;
  return out;
}

function bookingToBackend(b: Partial<TenantBookingSettings>): Partial<RawBookingSettings> {
  const out: Partial<RawBookingSettings> = {};
  if (b.cancellationWindowHours !== undefined)
    out.cancellation_window_hours = b.cancellationWindowHours;
  if (b.autoApproveEnabled !== undefined) out.auto_approve_enabled = b.autoApproveEnabled;
  if (b.minBookingAdvanceHours !== undefined)
    out.min_booking_advance_hours = b.minBookingAdvanceHours;
  if (b.maxBookingAdvanceDays !== undefined) out.max_booking_advance_days = b.maxBookingAdvanceDays;
  if (b.serviceBufferMinutes !== undefined) out.service_buffer_minutes = b.serviceBufferMinutes;
  if (b.slotGranularityMinutes !== undefined)
    out.slot_granularity_minutes = b.slotGranularityMinutes;
  return out;
}

function dayToBackend(day: TenantDayHours | null | undefined): RawDayHours | undefined {
  if (day === undefined) return undefined;
  return day === null ? null : { open: day.open, close: day.close };
}

function businessHoursToBackend(bh: Partial<TenantBusinessHours>): Partial<RawBusinessHours> {
  const out: Partial<RawBusinessHours> = {};
  if (bh.timezone !== undefined) out.timezone = bh.timezone;
  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ] as const;
  for (const day of days) {
    const mapped = dayToBackend(bh[day]);
    if (mapped !== undefined) out[day] = mapped;
  }
  return out;
}

function localizationToBackend(
  l: Partial<TenantLocalizationSettings>,
): Partial<RawLocalizationSettings> {
  const out: Partial<RawLocalizationSettings> = {};
  if (l.countryCode !== undefined) out.country_code = l.countryCode;
  if (l.currency !== undefined) out.currency = l.currency;
  if (l.currencySymbol !== undefined) out.currency_symbol = l.currencySymbol;
  if (l.language !== undefined) out.language = l.language;
  if (l.decimalPlaces !== undefined) out.decimal_places = l.decimalPlaces;
  return out;
}

function addressToBackend(
  address: TenantBusinessInfoAddressUpdateInput | null | undefined,
): RawBusinessInfoAddressUpdate | null | undefined {
  if (address === undefined) return undefined;
  if (address === null) return null;
  return {
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    zip_code: address.zipCode,
  };
}

function socialLinksToBackend(
  links: TenantSocialLinksUpdateInput | null | undefined,
): RawSocialLinksUpdate | null | undefined {
  if (links === undefined) return undefined;
  if (links === null) return null;
  return { whatsapp: links.whatsapp, instagram: links.instagram, facebook: links.facebook };
}

function businessInfoToBackend(
  b: NonNullable<TenantSettingsUpdateInput['businessInfo']>,
): RawBusinessInfoUpdate {
  const out: RawBusinessInfoUpdate = {};
  if (b.phone !== undefined) out.phone = b.phone;
  if (b.email !== undefined) out.email = b.email;
  const address = addressToBackend(b.address);
  if (address !== undefined) out.address = address;
  const socialLinks = socialLinksToBackend(b.socialLinks);
  if (socialLinks !== undefined) out.social_links = socialLinks;
  return out;
}

export function toBackendSettingsBody(settings: TenantSettingsUpdateInput): {
  settings: RawTenantSettingsUpdate;
} {
  const out: RawTenantSettingsUpdate = {};
  if (settings.loyalty !== undefined) out.loyalty = loyaltyToBackend(settings.loyalty);
  if (settings.booking !== undefined) out.booking = bookingToBackend(settings.booking);
  if (settings.businessHours !== undefined)
    out.business_hours = businessHoursToBackend(settings.businessHours);
  if (settings.localization !== undefined)
    out.localization = localizationToBackend(settings.localization);
  if (settings.businessInfo !== undefined)
    out.business_info = businessInfoToBackend(settings.businessInfo);
  return { settings: out };
}
