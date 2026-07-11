import { PlatformErrorCode } from '@ikaro/types';
import type { LoyaltySettings } from '../../../../../shared/value-objects/tenant-settings-data';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';

export class LoyaltySettingsValidator {
  static validate(loyalty: LoyaltySettings): void {
    LoyaltySettingsValidator.validateExpiryDays(loyalty);
    LoyaltySettingsValidator.validateExpiryWarningDays(loyalty);
    LoyaltySettingsValidator.validateNotificationMinPoints(loyalty);
    LoyaltySettingsValidator.validatePointsPerCurrencyUnit(loyalty);
  }

  private static validateExpiryDays(loyalty: LoyaltySettings): void {
    if (loyalty.expiryDays < 1 || loyalty.expiryDays > 3650) {
      throw new TenantSettingsValidationError(
        'loyalty.expiryDays must be between 1 and 3650',
        PlatformErrorCode.SETTINGS_LOYALTY_EXPIRY_DAYS_INVALID,
        'loyalty.expiryDays',
      );
    }
  }

  private static validateExpiryWarningDays(loyalty: LoyaltySettings): void {
    if (loyalty.expiryWarningDays < 1 || loyalty.expiryWarningDays > 90) {
      throw new TenantSettingsValidationError(
        'loyalty.expiryWarningDays must be between 1 and 90',
        PlatformErrorCode.SETTINGS_LOYALTY_EXPIRY_WARNING_DAYS_INVALID,
        'loyalty.expiryWarningDays',
      );
    }
    if (loyalty.expiryWarningDays >= loyalty.expiryDays) {
      throw new TenantSettingsValidationError(
        'loyalty.expiryWarningDays must be less than expiryDays',
        PlatformErrorCode.SETTINGS_LOYALTY_EXPIRY_WARNING_TOO_LATE,
        'loyalty.expiryWarningDays',
      );
    }
  }

  private static validateNotificationMinPoints(loyalty: LoyaltySettings): void {
    if (loyalty.notificationMinPoints < 0 || loyalty.notificationMinPoints > 10000) {
      throw new TenantSettingsValidationError(
        'loyalty.notificationMinPoints must be between 0 and 10000',
        PlatformErrorCode.SETTINGS_LOYALTY_NOTIFICATION_MIN_POINTS_INVALID,
        'loyalty.notificationMinPoints',
      );
    }
  }

  private static validatePointsPerCurrencyUnit(loyalty: LoyaltySettings): void {
    if (loyalty.pointsPerCurrencyUnit < 0 || loyalty.pointsPerCurrencyUnit > 10000) {
      throw new TenantSettingsValidationError(
        'loyalty.pointsPerCurrencyUnit must be between 0 and 10000',
        PlatformErrorCode.SETTINGS_LOYALTY_POINTS_PER_CURRENCY_UNIT_INVALID,
        'loyalty.pointsPerCurrencyUnit',
      );
    }
  }
}
