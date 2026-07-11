import { PlatformErrorCode } from '@ikaro/types';
import type { LoyaltySettings } from '../../../../../shared/value-objects/tenant-settings-data';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';
import { LoyaltySettingsValidator } from './loyalty-settings.validator';

const VALID: LoyaltySettings = {
  expiryDays: 180,
  enableNotifications: true,
  expiryWarningDays: 7,
  notificationMinPoints: 50,
  pointsPerCurrencyUnit: 0,
};

function expectCode(loyalty: LoyaltySettings, code: string): void {
  let err: unknown;
  try {
    LoyaltySettingsValidator.validate(loyalty);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(TenantSettingsValidationError);
  expect((err as TenantSettingsValidationError).code).toBe(code);
}

describe('LoyaltySettingsValidator', () => {
  it('accepts valid settings', () => {
    expect(() => LoyaltySettingsValidator.validate(VALID)).not.toThrow();
  });

  it('rejects expiryDays outside 1-3650', () => {
    expectCode(
      { ...VALID, expiryDays: 3651 },
      PlatformErrorCode.SETTINGS_LOYALTY_EXPIRY_DAYS_INVALID,
    );
  });

  it('rejects expiryWarningDays outside 1-90', () => {
    expectCode(
      { ...VALID, expiryWarningDays: 91 },
      PlatformErrorCode.SETTINGS_LOYALTY_EXPIRY_WARNING_DAYS_INVALID,
    );
  });

  it('rejects expiryWarningDays >= expiryDays', () => {
    expectCode(
      { ...VALID, expiryDays: 10, expiryWarningDays: 10 },
      PlatformErrorCode.SETTINGS_LOYALTY_EXPIRY_WARNING_TOO_LATE,
    );
  });

  it('rejects notificationMinPoints outside 0-10000', () => {
    expectCode(
      { ...VALID, notificationMinPoints: 10001 },
      PlatformErrorCode.SETTINGS_LOYALTY_NOTIFICATION_MIN_POINTS_INVALID,
    );
  });

  it('rejects pointsPerCurrencyUnit outside 0-10000', () => {
    expectCode(
      { ...VALID, pointsPerCurrencyUnit: -1 },
      PlatformErrorCode.SETTINGS_LOYALTY_POINTS_PER_CURRENCY_UNIT_INVALID,
    );
  });
});
