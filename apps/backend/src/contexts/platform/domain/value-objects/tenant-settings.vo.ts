import { countrySpec } from '@ikaro/i18n';
import { Address, type AddressProps } from '../../../../shared/value-objects/address';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { Email } from '../../../../shared/value-objects/email.vo';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import type {
  BusinessInfo,
  BookingSettings,
  ChatbotSettings,
  LeadFormSettings,
  LocalizationSettings,
  LoyaltySettings,
  NotificationSettings,
  ResolvedLocalization,
  TenantSettingsData,
} from '../../../../shared/value-objects/tenant-settings-data';
import { BookingSettingsValidator } from './validators/booking-settings.validator';
import { BusinessHoursValidator } from './validators/business-hours.validator';
import { BusinessInfoValidator } from './validators/business-info.validator';
import { ChatbotSettingsValidator } from './validators/chatbot-settings.validator';
import { LeadFormSettingsValidator } from './validators/lead-form-settings.validator';
import { LocalizationSettingsValidator } from './validators/localization-settings.validator';
import { LoyaltySettingsValidator } from './validators/loyalty-settings.validator';
import { NotificationSettingsValidator } from './validators/notification-settings.validator';
import { requireTrimmedString } from './validators/require-trimmed-string';
import {
  DEFAULT_BOOKING_SETTINGS,
  DEFAULT_BUSINESS_INFO_SETTINGS,
  DEFAULT_CHATBOT_SETTINGS,
  DEFAULT_LEAD_FORM_SETTINGS,
  DEFAULT_LOYALTY_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  buildDefaultBusinessHours,
} from './tenant-settings-defaults';

export type {
  AddressProps,
  BookingSettings,
  BusinessInfo,
  ChatbotSettings,
  LeadFormSettings,
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

  get chatbot(): ChatbotSettings {
    // Per-field default, not whole-object: an Ikaro override stored without ever touching
    // knowledgeText (e.g. `{ llmProvider: 'anthropic' }`) must still resolve knowledgeText to ''
    // rather than leaving it undefined.
    return { knowledgeText: '', ...this.props.chatbot };
  }

  get leadForm(): LeadFormSettings {
    return { ...this.props.leadForm };
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
      loyalty: DEFAULT_LOYALTY_SETTINGS,
      booking: DEFAULT_BOOKING_SETTINGS,
      businessHours: buildDefaultBusinessHours(timezone),
      localization: {
        countryCode: resolvedCountryCode.value,
        currency: spec.currency,
        language: spec.language,
        decimalPlaces: 2,
      },
      notification: DEFAULT_NOTIFICATION_SETTINGS,
      businessInfo: DEFAULT_BUSINESS_INFO_SETTINGS,
      chatbot: DEFAULT_CHATBOT_SETTINGS,
      leadForm: DEFAULT_LEAD_FORM_SETTINGS,
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
    // Runs strictly after validate() succeeds: BusinessInfoValidator/NotificationSettingsValidator
    // already confirmed the raw format via Email.isValid() and throw their own typed error codes
    // (SETTINGS_BUSINESS_EMAIL_INVALID / SETTINGS_NOTIFICATION_EMAIL_INVALID) on a bad value — an
    // already-valid email can never fail Email.create() here, so this step only ever normalizes
    // (lowercase/trim), never changes what error a caller sees for invalid input.
    return new TenantSettings(TenantSettings.normalizeValidatedEmails(normalizedProps));
  }

  static reconstitute(props: TenantSettingsProps): TenantSettings {
    return new TenantSettings({
      ...props,
      leadForm: props.leadForm ?? DEFAULT_LEAD_FORM_SETTINGS,
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
    ChatbotSettingsValidator.validate(props.chatbot);
    LeadFormSettingsValidator.validate(props.leadForm);
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

  private static normalizeValidatedEmails(props: TenantSettingsProps): TenantSettingsProps {
    return {
      ...props,
      businessInfo:
        props.businessInfo?.email == null
          ? props.businessInfo
          : { ...props.businessInfo, email: Email.create(props.businessInfo.email).address },
      notification:
        props.notification?.fromEmail == null
          ? props.notification
          : {
              ...props.notification,
              fromEmail: Email.create(props.notification.fromEmail).address,
            },
    };
  }
}
