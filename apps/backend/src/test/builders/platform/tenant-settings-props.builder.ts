import {
  BookingSettings,
  BusinessInfo,
  LocalizationSettings,
  LoyaltySettings,
  NotificationSettings,
  SocialLinks,
  TenantSettings,
  TenantSettingsProps,
} from '../../../contexts/platform/domain/value-objects/tenant-settings.vo';
import type { BusinessHours } from '../../../shared/value-objects/business-hours.vo';

export class TenantSettingsPropsBuilder {
  private readonly props: TenantSettingsProps;

  constructor() {
    this.props = TenantSettings.default().toJSON();
  }

  withLoyalty(overrides: Partial<LoyaltySettings>): this {
    this.props.loyalty = { ...this.props.loyalty, ...overrides };
    return this;
  }

  withBooking(overrides: Partial<BookingSettings>): this {
    this.props.booking = { ...this.props.booking, ...overrides };
    return this;
  }

  withBusinessHours(overrides: Partial<BusinessHours>): this {
    this.props.businessHours = { ...this.props.businessHours, ...overrides };
    return this;
  }

  withLocalization(overrides: Partial<LocalizationSettings>): this {
    this.props.localization = { ...this.props.localization, ...overrides };
    return this;
  }

  withNotification(overrides: Partial<NotificationSettings>): this {
    this.props.notification = { fromEmail: null, ...this.props.notification, ...overrides };
    return this;
  }

  withBusinessInfo(overrides: Partial<BusinessInfo>): this {
    this.props.businessInfo = {
      phone: null,
      email: null,
      address: null,
      socialLinks: null,
      ...this.props.businessInfo,
      ...overrides,
    };
    return this;
  }

  withSocialLinks(overrides: Partial<SocialLinks>): this {
    const current = this.props.businessInfo?.socialLinks ?? {
      whatsapp: null,
      instagram: null,
      facebook: null,
    };
    this.props.businessInfo = {
      phone: null,
      email: null,
      address: null,
      ...this.props.businessInfo,
      socialLinks: { ...current, ...overrides },
    };
    return this;
  }

  build(): TenantSettingsProps {
    return structuredClone(this.props);
  }
}
