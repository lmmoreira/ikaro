import { PlatformErrorCode } from '@ikaro/types';
import type { BookingSettings } from '../../../../../shared/value-objects/tenant-settings-data';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';

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
    if (booking.minBookingAdvanceHours < 0) {
      throw new TenantSettingsValidationError(
        'booking.minBookingAdvanceHours must be >= 0',
        PlatformErrorCode.SETTINGS_BOOKING_MIN_ADVANCE_HOURS_INVALID,
        'booking.minBookingAdvanceHours',
      );
    }
    if (booking.maxBookingAdvanceDays < 1) {
      throw new TenantSettingsValidationError(
        'booking.maxBookingAdvanceDays must be >= 1',
        PlatformErrorCode.SETTINGS_BOOKING_MAX_ADVANCE_DAYS_INVALID,
        'booking.maxBookingAdvanceDays',
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
