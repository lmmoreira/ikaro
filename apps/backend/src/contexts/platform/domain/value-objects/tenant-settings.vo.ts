import { AddressSpec, countrySpec } from '@ikaro/i18n';
import { Email } from '../../../../shared/value-objects/email.vo';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { Timezone } from '../../../../shared/value-objects/timezone.vo';
import { PlatformDomainError } from '../errors/platform-domain.error';

export type DayHours = { open: string; close: string } | null;

export interface NotificationSettings {
  fromEmail: string | null;
}

export interface LoyaltySettings {
  expiryDays: number;
  enableNotifications: boolean;
  expiryWarningDays: number;
  notificationMinPoints: number;
  pointsPerCurrencyUnit: number;
}

export interface BookingSettings {
  cancellationWindowHours: number;
  autoApproveEnabled: boolean;
  minBookingAdvanceHours: number;
  maxBookingAdvanceDays: number;
  serviceBufferMinutes: number;
  slotGranularityMinutes: 15 | 30 | 60;
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
  countryCode: string;
  currency: string;
  currencySymbol?: string;
  language: string;
  decimalPlaces: number;
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
  zipCode: string;
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
  socialLinks: SocialLinks | null;
}

export interface TenantSettingsProps {
  loyalty: LoyaltySettings;
  booking: BookingSettings;
  businessHours: BusinessHours;
  localization: LocalizationSettings;
  notification?: NotificationSettings;
  businessInfo?: BusinessInfo;
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

  get businessHours(): BusinessHours {
    return structuredClone(this.props.businessHours);
  }

  get localization(): LocalizationSettings {
    return { ...this.props.localization };
  }

  get notification(): NotificationSettings {
    return this.props.notification ?? { fromEmail: null };
  }

  resolveLocalization(): ResolvedLocalization {
    const spec = countrySpec(this.props.localization.countryCode);
    return {
      countryCode: this.props.localization.countryCode,
      language: this.props.localization.language,
      currency: this.props.localization.currency,
      decimalPlaces: this.props.localization.decimalPlaces,
      phonePrefix: spec.phonePrefix,
      dateFormat: spec.dateFormat,
      timeFormat: spec.timeFormat,
      numberFormat: spec.numberFormat,
      firstDayOfWeek: spec.firstDayOfWeek,
      address: spec.address,
    };
  }

  get businessInfo(): BusinessInfo {
    return {
      phone: this.props.businessInfo?.phone ?? null,
      email: this.props.businessInfo?.email ?? null,
      address: this.props.businessInfo?.address ?? null,
      socialLinks: this.props.businessInfo?.socialLinks ?? null,
    };
  }

  toJSON(): TenantSettingsProps {
    const clone = structuredClone(this.props);
    return {
      ...clone,
      businessInfo: {
        phone: clone.businessInfo?.phone ?? null,
        email: clone.businessInfo?.email ?? null,
        address: clone.businessInfo?.address ?? null,
        socialLinks: clone.businessInfo?.socialLinks ?? null,
      },
    };
  }

  static default(timezone = 'America/Sao_Paulo', countryCode = 'BR'): TenantSettings {
    const spec = countrySpec(countryCode);
    return new TenantSettings({
      loyalty: {
        expiryDays: 180,
        enableNotifications: true,
        expiryWarningDays: 7,
        notificationMinPoints: 50,
        pointsPerCurrencyUnit: 0,
      },
      booking: {
        cancellationWindowHours: 48,
        autoApproveEnabled: false,
        minBookingAdvanceHours: 0,
        maxBookingAdvanceDays: 90,
        serviceBufferMinutes: 60,
        slotGranularityMinutes: 30,
      },
      businessHours: {
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
        countryCode,
        currency: spec.currency,
        language: spec.language,
        decimalPlaces: 2,
      },
      notification: {
        fromEmail: null,
      },
      businessInfo: {
        phone: null,
        email: null,
        address: null,
        socialLinks: null,
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
    TenantSettings.validateBusinessHours(props.businessHours);
    TenantSettings.validateBusinessInfo(props.businessInfo, props.localization.countryCode);
  }

  private static validateLoyalty(loyalty: LoyaltySettings): void {
    if (loyalty.expiryDays < 1 || loyalty.expiryDays > 3650) {
      throw new PlatformDomainError('loyalty.expiryDays must be between 1 and 3650');
    }
    if (loyalty.expiryWarningDays < 1 || loyalty.expiryWarningDays > 90) {
      throw new PlatformDomainError('loyalty.expiryWarningDays must be between 1 and 90');
    }
    if (loyalty.expiryWarningDays >= loyalty.expiryDays) {
      throw new PlatformDomainError('loyalty.expiryWarningDays must be less than expiryDays');
    }
    if (loyalty.notificationMinPoints < 0 || loyalty.notificationMinPoints > 10000) {
      throw new PlatformDomainError('loyalty.notificationMinPoints must be between 0 and 10000');
    }
    if (loyalty.pointsPerCurrencyUnit < 0 || loyalty.pointsPerCurrencyUnit > 10000) {
      throw new PlatformDomainError('loyalty.pointsPerCurrencyUnit must be between 0 and 10000');
    }
  }

  private static validateBooking(booking: BookingSettings): void {
    if (booking.cancellationWindowHours < 0 || booking.cancellationWindowHours > 720) {
      throw new PlatformDomainError('booking.cancellationWindowHours must be between 0 and 720');
    }
    if (booking.minBookingAdvanceHours < 0) {
      throw new PlatformDomainError('booking.minBookingAdvanceHours must be >= 0');
    }
    if (booking.maxBookingAdvanceDays < 1) {
      throw new PlatformDomainError('booking.maxBookingAdvanceDays must be >= 1');
    }
    if (booking.serviceBufferMinutes < 0 || booking.serviceBufferMinutes > 120) {
      throw new PlatformDomainError('booking.serviceBufferMinutes must be between 0 and 120');
    }
    if (![15, 30, 60].includes(booking.slotGranularityMinutes)) {
      throw new PlatformDomainError('booking.slotGranularityMinutes must be 15, 30, or 60');
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
      throw new PlatformDomainError(`businessHours.${day}: open/close must be HH:MM format`);
    }
    if (hours.close <= hours.open) {
      throw new PlatformDomainError(`businessHours.${day}: close must be after open`);
    }
  }

  private static validateBusinessInfo(
    businessInfo: BusinessInfo | undefined,
    countryCode: string,
  ): void {
    if (!businessInfo) return;
    if (businessInfo.phone != null && !PhoneNumber.isValid(businessInfo.phone)) {
      throw new PlatformDomainError('businessInfo.phone must be a valid phone number');
    }
    if (businessInfo.email != null && !Email.isValid(businessInfo.email)) {
      throw new PlatformDomainError('businessInfo.email must be a valid email address');
    }
    TenantSettings.validateBusinessAddress(businessInfo.address, countryCode);
    TenantSettings.validateSocialLinks(businessInfo.socialLinks);
  }

  private static validateSocialLinks(socialLinks: SocialLinks | null): void {
    if (socialLinks == null) return;
    if (socialLinks.whatsapp != null && !PhoneNumber.isValid(socialLinks.whatsapp)) {
      throw new PlatformDomainError(
        'businessInfo.socialLinks.whatsapp must be a valid phone number',
      );
    }
  }

  private static validateBusinessAddress(
    address: BusinessInfoAddress | null,
    countryCode: string,
  ): void {
    if (address == null) return;
    const spec = countrySpec(countryCode).address;
    if (spec.postalRegex !== null && !spec.postalRegex.test(address.zipCode)) {
      throw new PlatformDomainError(
        `businessInfo.address.zipCode is not a valid ${spec.postalLabel}`,
      );
    }
    if (spec.statePattern !== null && !spec.statePattern.test(address.state)) {
      throw new PlatformDomainError(`businessInfo.address.state is not a valid ${spec.stateLabel}`);
    }
    const alwaysRequired = ['street', 'number', 'city', 'state', 'zipCode'] as const;
    for (const field of alwaysRequired) {
      if (!address[field]) {
        throw new PlatformDomainError(`businessInfo.address.${field} is required`);
      }
    }
    if (spec.requireNeighborhood && !address.neighborhood) {
      throw new PlatformDomainError('businessInfo.address.neighborhood is required');
    }
  }
}
