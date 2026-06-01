import {
  BookingSettings,
  BusinessHours,
  LoyaltySettings,
  NotificationSettings,
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

  withNotification(overrides: Partial<NotificationSettings>): this {
    this.props.notification = { from_email: null, ...this.props.notification, ...overrides };
    return this;
  }

  build(): TenantSettingsProps {
    return structuredClone(this.props);
  }
}
