import { AddressSpec, countrySpec } from '@ikaro/i18n';
import { Email } from '../../../../shared/value-objects/email.vo';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { Timezone } from '../../../../shared/value-objects/timezone.vo';
import { PlatformDomainError } from '../errors/platform-domain.error';

export type DayHours = { open: string; close: string } | null;

export interface NotificationSettings {
  from_email: string | null;
}

export interface LoyaltySettings {
  expiry_days: number;
  enable_notifications: boolean;
  expiry_warning_days: number;
  notification_min_points: number;
}

export interface BookingSettings {
  cancellation_window_hours: number;
  auto_approve_enabled: boolean;
  min_booking_advance_hours: number;
  max_booking_advance_days: number;
  service_buffer_minutes: number;
  slot_granularity_minutes: 15 | 30 | 60;
}

export interface BusinessHours {
  timezone: string;
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

export interface LocalizationSettings {
  country_code: string;
  currency: string;
  currency_symbol?: string;
  language: string;
  decimal_places: number;
}

export interface ResolvedLocalization {
  countryCode: string;
  language: string;
  currency: string;
  decimalPlaces: number;
  phonePrefix: string;
  dateFormat: string;
  timeFormat: '24h' | '12h';
  numberFormat: string;
  firstDayOfWeek: 0 | 1;
  address: AddressSpec;
}

export interface BusinessInfoAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
}

export interface SocialLinks {
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
}

export interface BusinessInfo {
  phone: string | null;
  email: string | null;
  address: BusinessInfoAddress | null;
  social_links: SocialLinks | null;
}

export interface TenantSettingsProps {
  loyalty: LoyaltySettings;
  booking: BookingSettings;
  business_hours: BusinessHours;
  localization: LocalizationSettings;
  notification?: NotificationSettings;
  business_info?: BusinessInfo;
}

export class TenantSettings {
  private readonly props: TenantSettingsProps;

  private constructor(props: TenantSettingsProps) {
    this.props = props;
  }

  get loyalty(): LoyaltySettings {
    return { ...this.props.loyalty };
  }

  get booking(): BookingSettings {
    return { ...this.props.booking };
  }

  get business_hours(): BusinessHours {
    return structuredClone(this.props.business_hours);
  }

  get localization(): LocalizationSettings {
    return { ...this.props.localization };
  }

  get notification(): NotificationSettings {
    return this.props.notification ?? { from_email: null };
  }

  resolveLocalization(): ResolvedLocalization {
    const spec = countrySpec(this.props.localization.country_code);
    return {
      countryCode: this.props.localization.country_code,
      language: this.props.localization.language,
      currency: this.props.localization.currency,
      decimalPlaces: this.props.localization.decimal_places,
      phonePrefix: spec.phonePrefix,
      dateFormat: spec.dateFormat,
      timeFormat: spec.timeFormat,
      numberFormat: spec.numberFormat,
      firstDayOfWeek: spec.firstDayOfWeek,
      address: spec.address,
    };
  }

  get business_info(): BusinessInfo {
    return {
      phone: this.props.business_info?.phone ?? null,
      email: this.props.business_info?.email ?? null,
      address: this.props.business_info?.address ?? null,
      social_links: this.props.business_info?.social_links ?? null,
    };
  }

  toJSON(): TenantSettingsProps {
    const clone = structuredClone(this.props);
    return {
      ...clone,
      business_info: {
        phone: clone.business_info?.phone ?? null,
        email: clone.business_info?.email ?? null,
        address: clone.business_info?.address ?? null,
        social_links: clone.business_info?.social_links ?? null,
      },
    };
  }

  static default(timezone = 'America/Sao_Paulo', country_code = 'BR'): TenantSettings {
    const spec = countrySpec(country_code);
    return new TenantSettings({
      loyalty: {
        expiry_days: 180,
        enable_notifications: true,
        expiry_warning_days: 7,
        notification_min_points: 50,
      },
      booking: {
        cancellation_window_hours: 48,
        auto_approve_enabled: false,
        min_booking_advance_hours: 0,
        max_booking_advance_days: 90,
        service_buffer_minutes: 60,
        slot_granularity_minutes: 30,
      },
      business_hours: {
        timezone,
        monday: { open: '09:00', close: '18:00' },
        tuesday: { open: '09:00', close: '18:00' },
        wednesday: { open: '09:00', close: '18:00' },
        thursday: { open: '09:00', close: '18:00' },
        friday: { open: '09:00', close: '18:00' },
        saturday: { open: '09:00', close: '17:00' },
        sunday: null,
      },
      localization: {
        country_code,
        currency: spec.currency,
        language: spec.language,
        decimal_places: 2,
      },
      notification: {
        from_email: null,
      },
      business_info: {
        phone: null,
        email: null,
        address: null,
        social_links: null,
      },
    });
  }

  static create(props: TenantSettingsProps): TenantSettings {
    TenantSettings.validate(props);
    return new TenantSettings(props);
  }

  static reconstitute(props: TenantSettingsProps): TenantSettings {
    return new TenantSettings(props);
  }

  private static validate(props: TenantSettingsProps): void {
    TenantSettings.validateLoyalty(props.loyalty);
    TenantSettings.validateBooking(props.booking);
    TenantSettings.validateBusinessHours(props.business_hours);
    TenantSettings.validateBusinessInfo(props.business_info, props.localization.country_code);
  }

  private static validateLoyalty(loyalty: LoyaltySettings): void {
    if (loyalty.expiry_days < 1 || loyalty.expiry_days > 3650) {
      throw new PlatformDomainError('loyalty.expiry_days must be between 1 and 3650');
    }
    if (loyalty.expiry_warning_days < 1 || loyalty.expiry_warning_days > 90) {
      throw new PlatformDomainError('loyalty.expiry_warning_days must be between 1 and 90');
    }
    if (loyalty.expiry_warning_days >= loyalty.expiry_days) {
      throw new PlatformDomainError('loyalty.expiry_warning_days must be less than expiry_days');
    }
    if (loyalty.notification_min_points < 0 || loyalty.notification_min_points > 10000) {
      throw new PlatformDomainError('loyalty.notification_min_points must be between 0 and 10000');
    }
  }

  private static validateBooking(booking: BookingSettings): void {
    if (booking.cancellation_window_hours < 0 || booking.cancellation_window_hours > 720) {
      throw new PlatformDomainError('booking.cancellation_window_hours must be between 0 and 720');
    }
    if (booking.min_booking_advance_hours < 0) {
      throw new PlatformDomainError('booking.min_booking_advance_hours must be >= 0');
    }
    if (booking.max_booking_advance_days < 1) {
      throw new PlatformDomainError('booking.max_booking_advance_days must be >= 1');
    }
    if (booking.service_buffer_minutes < 0 || booking.service_buffer_minutes > 120) {
      throw new PlatformDomainError('booking.service_buffer_minutes must be between 0 and 120');
    }
    if (![15, 30, 60].includes(booking.slot_granularity_minutes)) {
      throw new PlatformDomainError('booking.slot_granularity_minutes must be 15, 30, or 60');
    }
  }

  private static validateBusinessHours(businessHours: BusinessHours): void {
    if (!Timezone.isValid(businessHours.timezone)) {
      throw new PlatformDomainError(`Invalid IANA timezone: ${businessHours.timezone}`);
    }
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
      TenantSettings.validateDayHours(day, businessHours[day]);
    }
  }

  private static validateDayHours(day: string, hours: DayHours): void {
    if (hours === null || hours === undefined) return;
    if (!TimeOfDay.isValid(hours.open) || !TimeOfDay.isValid(hours.close)) {
      throw new PlatformDomainError(`business_hours.${day}: open/close must be HH:MM format`);
    }
    if (hours.close <= hours.open) {
      throw new PlatformDomainError(`business_hours.${day}: close must be after open`);
    }
  }

  private static validateBusinessInfo(
    businessInfo: BusinessInfo | undefined,
    country_code: string,
  ): void {
    if (!businessInfo) return;
    if (businessInfo.phone != null && !PhoneNumber.isValid(businessInfo.phone)) {
      throw new PlatformDomainError('business_info.phone must be a valid phone number');
    }
    if (businessInfo.email != null && !Email.isValid(businessInfo.email)) {
      throw new PlatformDomainError('business_info.email must be a valid email address');
    }
    TenantSettings.validateBusinessAddress(businessInfo.address, country_code);
    TenantSettings.validateSocialLinks(businessInfo.social_links);
  }

  private static validateSocialLinks(socialLinks: SocialLinks | null): void {
    if (socialLinks == null) return;
    if (socialLinks.whatsapp != null && !PhoneNumber.isValid(socialLinks.whatsapp)) {
      throw new PlatformDomainError(
        'business_info.social_links.whatsapp must be a valid phone number',
      );
    }
  }

  private static validateBusinessAddress(
    address: BusinessInfoAddress | null,
    country_code: string,
  ): void {
    if (address == null) return;
    const spec = countrySpec(country_code).address;
    if (spec.postalRegex !== null && !spec.postalRegex.test(address.zip_code)) {
      throw new PlatformDomainError(
        `business_info.address.zip_code is not a valid ${spec.postalLabel}`,
      );
    }
    if (spec.statePattern !== null && !spec.statePattern.test(address.state)) {
      throw new PlatformDomainError(
        `business_info.address.state is not a valid ${spec.stateLabel}`,
      );
    }
    const alwaysRequired = ['street', 'number', 'city', 'state', 'zip_code'] as const;
    for (const field of alwaysRequired) {
      if (!address[field]) {
        throw new PlatformDomainError(`business_info.address.${field} is required`);
      }
    }
    if (spec.requireNeighborhood && !address.neighborhood) {
      throw new PlatformDomainError('business_info.address.neighborhood is required');
    }
  }
}
