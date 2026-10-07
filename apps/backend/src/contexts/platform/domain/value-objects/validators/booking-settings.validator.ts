import { PlatformErrorCode } from '@ikaro/types/protocol/errors';
import type { BookingSettings } from '../../../../../shared/value-objects/tenant-settings-data';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';

const MAX_MIN_BOOKING_ADVANCE_HOURS = 8760;
const MAX_BOOKING_ADVANCE_DAYS = 365;
const HOURS_PER_DAY = 24;

export class BookingSettingsValidator {
  static validate(booking: BookingSettings): void {
    BookingSettingsValidator.validateCancellationWindow(booking);
    BookingSettingsValidator.validateAdvanceNotice(booking);
    BookingSettingsValidator.validateServiceBuffer(booking);
    BookingSettingsValidator.validateSlotGranularity(booking);
    BookingSettingsValidator.validateWelcomeStaffScreenDays(booking);
  }

  private static validateCancellationWindow(booking: BookingSettings): void {
    if (booking.cancellationWindowHours < 0 || booking.cancellationWindowHours > 720) {
      throw new TenantSettingsValidationError(
        'booking.cancellationWindowHours must be between 0 and 720',
        PlatformErrorCode.SETTINGS_BOOKING_CANCELLATION_WINDOW_INVALID,
        'booking.cancellationWindowHours',
      );
    }
  }

  private static validateAdvanceNotice(booking: BookingSettings): void {
    const { minBookingAdvanceHours: minHours, maxBookingAdvanceDays: maxDays } = booking;
    if (minHours < 0 || minHours > MAX_MIN_BOOKING_ADVANCE_HOURS) {
      throw new TenantSettingsValidationError(
        `booking.minBookingAdvanceHours must be between 0 and ${MAX_MIN_BOOKING_ADVANCE_HOURS}`,
        PlatformErrorCode.SETTINGS_BOOKING_MIN_ADVANCE_HOURS_INVALID,
        'booking.minBookingAdvanceHours',
      );
    }
    if (maxDays < 1 || maxDays > MAX_BOOKING_ADVANCE_DAYS) {
      throw new TenantSettingsValidationError(
        `booking.maxBookingAdvanceDays must be between 1 and ${MAX_BOOKING_ADVANCE_DAYS}`,
        PlatformErrorCode.SETTINGS_BOOKING_MAX_ADVANCE_DAYS_INVALID,
        'booking.maxBookingAdvanceDays',
      );
    }
    // The minimum notice must leave at least one bookable day.
    if (minHours / HOURS_PER_DAY >= maxDays) {
      throw new TenantSettingsValidationError(
        'booking.minBookingAdvanceHours must be shorter than booking.maxBookingAdvanceDays',
        PlatformErrorCode.SETTINGS_BOOKING_MIN_ADVANCE_HOURS_INVALID,
        'booking.minBookingAdvanceHours',
      );
    }
  }

  private static validateServiceBuffer(booking: BookingSettings): void {
    if (booking.serviceBufferMinutes < 0 || booking.serviceBufferMinutes > 120) {
      throw new TenantSettingsValidationError(
        'booking.serviceBufferMinutes must be between 0 and 120',
        PlatformErrorCode.SETTINGS_BOOKING_SERVICE_BUFFER_INVALID,
        'booking.serviceBufferMinutes',
      );
    }
  }

  private static validateSlotGranularity(booking: BookingSettings): void {
    if (![15, 30, 60].includes(booking.slotGranularityMinutes)) {
      throw new TenantSettingsValidationError(
        'booking.slotGranularityMinutes must be 15, 30, or 60',
        PlatformErrorCode.SETTINGS_BOOKING_SLOT_GRANULARITY_INVALID,
        'booking.slotGranularityMinutes',
      );
    }
  }

  private static validateWelcomeStaffScreenDays(booking: BookingSettings): void {
    const { welcomeStaffScreenDays: days } = booking;
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new TenantSettingsValidationError(
        'booking.welcomeStaffScreenDays must be between 1 and 90',
        PlatformErrorCode.SETTINGS_BOOKING_WELCOME_STAFF_SCREEN_DAYS_INVALID,
        'booking.welcomeStaffScreenDays',
      );
    }
  }
}
