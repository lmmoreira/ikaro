import { countrySpec } from '@ikaro/i18n';
import { Address, type AddressProps } from '../../../../shared/value-objects/address';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import type {
  BusinessInfo,
  BookingSettings,
  LocalizationSettings,
  LoyaltySettings,
  NotificationSettings,
  ResolvedLocalization,
  TenantSettingsData,
} from '../../../../shared/value-objects/tenant-settings-data';
import { BookingSettingsValidator } from './validators/booking-settings.validator';
import { BusinessHoursValidator } from './validators/business-hours.validator';
import { BusinessInfoValidator } from './validators/business-info.validator';
import { LocalizationSettingsValidator } from './validators/localization-settings.validator';
import { LoyaltySettingsValidator } from './validators/loyalty-settings.validator';
import { NotificationSettingsValidator } from './validators/notification-settings.validator';
import { requireTrimmedString } from './validators/require-trimmed-string';

export type {
  AddressProps,
  BookingSettings,
  BusinessInfo,
  LocalizationSettings,
  LoyaltySettings,
  NotificationSettings,
  ResolvedLocalization,
};
export type { SocialLinks } from '../../../../shared/value-objects/tenant-settings-data';
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
    LoyaltySettingsValidator.validate(props.loyalty);
    BookingSettingsValidator.validate(props.booking);
    BusinessHoursValidator.validate(props.businessHours);
    LocalizationSettingsValidator.validate(props.localization);
    NotificationSettingsValidator.validate(props.notification);
    BusinessInfoValidator.validate(props.businessInfo);
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
      currency: requireTrimmedString(localization.currency, 'localization.currency'),
      language: requireTrimmedString(localization.language, 'localization.language'),
      currencySymbol:
        localization.currencySymbol == null
          ? localization.currencySymbol
          : requireTrimmedString(localization.currencySymbol, 'localization.currencySymbol'),
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
}
