import {
  BookingSettings,
  BusinessHours,
  BusinessInfo,
  LocalizationSettings,
  LoyaltySettings,
  NotificationSettings,
  SocialLinks,
  TenantSettings,
  TenantSettingsProps,
} from '../../../contexts/platform/domain/value-objects/tenant-settings.vo';

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
    this.props.business_hours = { ...this.props.business_hours, ...overrides };
    return this;
  }

  withLocalization(overrides: Partial<LocalizationSettings>): this {
    this.props.localization = { ...this.props.localization, ...overrides };
    return this;
  }

  withNotification(overrides: Partial<NotificationSettings>): this {
    this.props.notification = { from_email: null, ...this.props.notification, ...overrides };
    return this;
  }

  withBusinessInfo(overrides: Partial<BusinessInfo>): this {
    this.props.business_info = {
      phone: null,
      email: null,
      address: null,
      social_links: null,
      ...this.props.business_info,
      ...overrides,
    };
    return this;
  }

  withSocialLinks(overrides: Partial<SocialLinks>): this {
    const current = this.props.business_info?.social_links ?? {
      whatsapp: null,
      instagram: null,
      facebook: null,
    };
    this.props.business_info = {
      phone: null,
      email: null,
      address: null,
      ...this.props.business_info,
      social_links: { ...current, ...overrides },
    };
    return this;
  }

  build(): TenantSettingsProps {
    return structuredClone(this.props);
  }
}
