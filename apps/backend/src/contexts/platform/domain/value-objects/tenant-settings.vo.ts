import { countrySpec } from '@ikaro/i18n';
import { Email } from '../../../../shared/value-objects/email.vo';
import { Address, type AddressProps } from '../../../../shared/value-objects/address';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import type { BusinessHours, DayHours } from '../../../../shared/value-objects/business-hours.vo';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';
import type {
  BusinessInfo,
  BookingSettings,
  LocalizationSettings,
  LoyaltySettings,
  NotificationSettings,
  ResolvedLocalization,
  SocialLinks,
  TenantSettingsData,
} from '../../../../shared/value-objects/tenant-settings-data';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { Timezone } from '../../../../shared/value-objects/timezone.vo';
import { PlatformDomainError } from '../errors/platform-domain.error';

export type {
  AddressProps,
  BookingSettings,
  BusinessInfo,
  LocalizationSettings,
  LoyaltySettings,
  NotificationSettings,
  ResolvedLocalization,
  SocialLinks,
};
export type TenantSettingsProps = TenantSettingsData;

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
    const resolvedCountryCode = CountryCode.create(countryCode);
    const spec = resolvedCountryCode.spec;
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
        welcomeStaffScreenDays: 14,
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
        countryCode: resolvedCountryCode.value,
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
    const resolvedCountryCode = CountryCode.create(props.localization.countryCode);
    const normalizedProps = {
      ...props,
      localization: {
        ...TenantSettings.normalizeLocalization(props.localization),
        countryCode: resolvedCountryCode.value,
      },
      businessInfo: TenantSettings.normalizeBusinessInfo(props.businessInfo, resolvedCountryCode),
    };
    TenantSettings.validate(normalizedProps);
    return new TenantSettings(normalizedProps);
  }

  static reconstitute(props: TenantSettingsProps): TenantSettings {
    return new TenantSettings({
      ...props,
      booking: {
        ...props.booking,
        welcomeStaffScreenDays: props.booking.welcomeStaffScreenDays ?? 14,
      },
    });
  }

  private static validate(props: TenantSettingsProps): void {
    TenantSettings.validateLoyalty(props.loyalty);
    TenantSettings.validateBooking(props.booking);
    TenantSettings.validateBusinessHours(props.businessHours);
    TenantSettings.validateLocalization(props.localization);
    TenantSettings.validateNotification(props.notification);
    TenantSettings.validateBusinessInfo(props.businessInfo);
  }

  private static validateLocalization(localization: LocalizationSettings): void {
    const currency = TenantSettings.requireTrimmedString(
      localization.currency,
      'localization.currency',
    );
    if (!currency) {
      throw new TenantSettingsValidationError('localization.currency must not be empty');
    }
    const language = TenantSettings.requireTrimmedString(
      localization.language,
      'localization.language',
    );
    if (!language) {
      throw new TenantSettingsValidationError('localization.language must not be empty');
    }
    if (localization.currencySymbol != null) {
      const currencySymbol = TenantSettings.requireTrimmedString(
        localization.currencySymbol,
        'localization.currencySymbol',
      );
      if (currencySymbol.length < 1 || currencySymbol.length > 3) {
        throw new TenantSettingsValidationError(
          'localization.currencySymbol must be between 1 and 3 characters',
        );
      }
    }
    if (
      !Number.isInteger(localization.decimalPlaces) ||
      localization.decimalPlaces < 0 ||
      localization.decimalPlaces > 8
    ) {
      throw new TenantSettingsValidationError('localization.decimalPlaces must be between 0 and 8');
    }
  }

  private static validateNotification(notification: NotificationSettings | undefined): void {
    if (notification?.fromEmail != null && !Email.isValid(notification.fromEmail)) {
      throw new PlatformDomainError('notification.fromEmail must be a valid email address');
    }
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
    if (!Number.isInteger(booking.welcomeStaffScreenDays)) {
      throw new PlatformDomainError('booking.welcomeStaffScreenDays must be an integer');
    }
    if (booking.welcomeStaffScreenDays < 1 || booking.welcomeStaffScreenDays > 90) {
      throw new PlatformDomainError('booking.welcomeStaffScreenDays must be between 1 and 90');
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

  private static validateBusinessInfo(businessInfo: BusinessInfo | undefined): void {
    if (!businessInfo) return;
    if (businessInfo.phone != null && !PhoneNumber.isValid(businessInfo.phone)) {
      throw new PlatformDomainError('businessInfo.phone must be a valid phone number');
    }
    if (businessInfo.email != null && !Email.isValid(businessInfo.email)) {
      throw new PlatformDomainError('businessInfo.email must be a valid email address');
    }
    TenantSettings.validateSocialLinks(businessInfo.socialLinks);
  }

  private static normalizeBusinessInfo(
    businessInfo: BusinessInfo | undefined,
    countryCode: CountryCode,
  ): BusinessInfo | undefined {
    if (!businessInfo) return businessInfo;
    return {
      ...businessInfo,
      address: TenantSettings.normalizeBusinessAddress(businessInfo.address, countryCode),
    };
  }

  private static normalizeLocalization(localization: LocalizationSettings): LocalizationSettings {
    return {
      ...localization,
      currency: TenantSettings.requireTrimmedString(localization.currency, 'localization.currency'),
      language: TenantSettings.requireTrimmedString(localization.language, 'localization.language'),
      currencySymbol:
        localization.currencySymbol == null
          ? localization.currencySymbol
          : TenantSettings.requireTrimmedString(
              localization.currencySymbol,
              'localization.currencySymbol',
            ),
    };
  }

  private static normalizeBusinessAddress(
    address: AddressProps | null,
    countryCode: CountryCode,
  ): AddressProps | null {
    if (address == null) return null;
    const normalizedAddress = Address.create(address, countryCode.spec.address);
    return normalizedAddress.toJSON();
  }

  private static validateSocialLinks(socialLinks: SocialLinks | null): void {
    if (socialLinks == null) return;
    if (socialLinks.whatsapp != null && !PhoneNumber.isValid(socialLinks.whatsapp)) {
      throw new PlatformDomainError(
        'businessInfo.socialLinks.whatsapp must be a valid phone number',
      );
    }
  }

  private static requireTrimmedString(value: unknown, field: string): string {
    if (typeof value !== 'string') {
      throw new TenantSettingsValidationError(`${field} must be a string`);
    }
    return value.trim();
  }
}

export class TenantSettingsValidationError extends PlatformDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'TenantSettingsValidationError';
  }
}
