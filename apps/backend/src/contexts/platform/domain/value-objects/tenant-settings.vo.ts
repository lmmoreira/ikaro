import { PlatformDomainError } from '../errors/platform-domain.error';

export type DayHours = { open: string; close: string } | null;

export interface LoyaltySettings {
  expiry_days: number;
  enable_notifications: boolean;
  expiry_warning_days: number;
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
  currency: string;
  currency_symbol: string;
  language: string;
  decimal_places: number;
}

export interface TenantSettingsProps {
  loyalty: LoyaltySettings;
  booking: BookingSettings;
  business_hours: BusinessHours;
  localization: LocalizationSettings;
}

function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidHhmm(time: string): boolean {
  return /^\d{2}:\d{2}$/.test(time);
}

export class TenantSettings {
  private readonly props: TenantSettingsProps;

  private constructor(props: TenantSettingsProps) {
    this.props = props;
  }

  get loyalty(): LoyaltySettings {
    return this.props.loyalty;
  }

  get booking(): BookingSettings {
    return this.props.booking;
  }

  get business_hours(): BusinessHours {
    return this.props.business_hours;
  }

  get localization(): LocalizationSettings {
    return this.props.localization;
  }

  toJSON(): TenantSettingsProps {
    return { ...this.props };
  }

  static default(timezone = 'America/Sao_Paulo'): TenantSettings {
    return new TenantSettings({
      loyalty: {
        expiry_days: 180,
        enable_notifications: true,
        expiry_warning_days: 7,
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
        currency: 'BRL',
        currency_symbol: 'R$',
        language: 'pt-BR',
        decimal_places: 2,
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
    const { loyalty, booking, business_hours } = props;

    if (loyalty.expiry_days < 1 || loyalty.expiry_days > 3650) {
      throw new PlatformDomainError('loyalty.expiry_days must be between 1 and 3650');
    }
    if (loyalty.expiry_warning_days < 1 || loyalty.expiry_warning_days > 90) {
      throw new PlatformDomainError('loyalty.expiry_warning_days must be between 1 and 90');
    }
    if (loyalty.expiry_warning_days >= loyalty.expiry_days) {
      throw new PlatformDomainError('loyalty.expiry_warning_days must be less than expiry_days');
    }

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

    if (!isValidIanaTimezone(business_hours.timezone)) {
      throw new PlatformDomainError(`Invalid IANA timezone: ${business_hours.timezone}`);
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
      const hours = business_hours[day];
      if (hours !== null && hours !== undefined) {
        if (!isValidHhmm(hours.open) || !isValidHhmm(hours.close)) {
          throw new PlatformDomainError(`business_hours.${day}: open/close must be HH:MM format`);
        }
        if (hours.close <= hours.open) {
          throw new PlatformDomainError(`business_hours.${day}: close must be after open`);
        }
      }
    }
  }
}
