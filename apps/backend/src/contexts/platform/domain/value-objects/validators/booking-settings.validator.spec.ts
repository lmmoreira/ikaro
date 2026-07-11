import { PlatformErrorCode } from '@ikaro/types';
import type { BookingSettings } from '../../../../../shared/value-objects/tenant-settings-data';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';
import { BookingSettingsValidator } from './booking-settings.validator';

const VALID: BookingSettings = {
  cancellationWindowHours: 48,
  autoApproveEnabled: false,
  minBookingAdvanceHours: 0,
  maxBookingAdvanceDays: 90,
  serviceBufferMinutes: 60,
  slotGranularityMinutes: 30,
  welcomeStaffScreenDays: 14,
};

function expectCode(booking: BookingSettings, code: string): void {
  let err: unknown;
  try {
    BookingSettingsValidator.validate(booking);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(TenantSettingsValidationError);
  expect((err as TenantSettingsValidationError).code).toBe(code);
}

describe('BookingSettingsValidator', () => {
  it('accepts valid settings', () => {
    expect(() => BookingSettingsValidator.validate(VALID)).not.toThrow();
  });

  it('rejects cancellationWindowHours outside 0-720', () => {
    expectCode(
      { ...VALID, cancellationWindowHours: 721 },
      PlatformErrorCode.SETTINGS_BOOKING_CANCELLATION_WINDOW_INVALID,
    );
  });

  it('rejects negative minBookingAdvanceHours', () => {
    expectCode(
      { ...VALID, minBookingAdvanceHours: -1 },
      PlatformErrorCode.SETTINGS_BOOKING_MIN_ADVANCE_HOURS_INVALID,
    );
  });

  it('rejects maxBookingAdvanceDays below 1', () => {
    expectCode(
      { ...VALID, maxBookingAdvanceDays: 0 },
      PlatformErrorCode.SETTINGS_BOOKING_MAX_ADVANCE_DAYS_INVALID,
    );
  });

  it('rejects serviceBufferMinutes outside 0-120', () => {
    expectCode(
      { ...VALID, serviceBufferMinutes: 121 },
      PlatformErrorCode.SETTINGS_BOOKING_SERVICE_BUFFER_INVALID,
    );
  });

  it('rejects slotGranularityMinutes not in {15,30,60}', () => {
    expectCode(
      { ...VALID, slotGranularityMinutes: 45 as 15 | 30 | 60 },
      PlatformErrorCode.SETTINGS_BOOKING_SLOT_GRANULARITY_INVALID,
    );
  });

  it.each([
    ['a non-integer value', 7.5],
    ['a value below 1', 0],
    ['a value above 90', 91],
  ])('rejects welcomeStaffScreenDays with %s', (_label, welcomeStaffScreenDays) => {
    expectCode(
      { ...VALID, welcomeStaffScreenDays },
      PlatformErrorCode.SETTINGS_BOOKING_WELCOME_STAFF_SCREEN_DAYS_INVALID,
    );
  });
});
