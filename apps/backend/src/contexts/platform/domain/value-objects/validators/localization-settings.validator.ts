import { PlatformErrorCode } from '@ikaro/types';
import type { LocalizationSettings } from '../../../../../shared/value-objects/tenant-settings-data';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';
import { requireTrimmedString } from './require-trimmed-string';

export class LocalizationSettingsValidator {
  static validate(localization: LocalizationSettings): void {
    LocalizationSettingsValidator.validateCurrency(localization);
    LocalizationSettingsValidator.validateLanguage(localization);
    LocalizationSettingsValidator.validateCurrencySymbol(localization);
    LocalizationSettingsValidator.validateDecimalPlaces(localization);
  }

  private static validateCurrency(localization: LocalizationSettings): void {
    const currency = requireTrimmedString(localization.currency, 'localization.currency');
    if (!currency) {
      throw new TenantSettingsValidationError(
        'localization.currency must not be empty',
        PlatformErrorCode.SETTINGS_CURRENCY_REQUIRED,
        'localization.currency',
      );
    }
  }

  private static validateLanguage(localization: LocalizationSettings): void {
    const language = requireTrimmedString(localization.language, 'localization.language');
    if (!language) {
      throw new TenantSettingsValidationError(
        'localization.language must not be empty',
        PlatformErrorCode.SETTINGS_LANGUAGE_REQUIRED,
        'localization.language',
      );
    }
  }

  private static validateCurrencySymbol(localization: LocalizationSettings): void {
    if (localization.currencySymbol == null) return;
    const currencySymbol = requireTrimmedString(
      localization.currencySymbol,
      'localization.currencySymbol',
    );
    if (currencySymbol.length < 1 || currencySymbol.length > 3) {
      throw new TenantSettingsValidationError(
        'localization.currencySymbol must be between 1 and 3 characters',
        PlatformErrorCode.SETTINGS_CURRENCY_SYMBOL_INVALID,
        'localization.currencySymbol',
      );
    }
  }

  private static validateDecimalPlaces(localization: LocalizationSettings): void {
    const { decimalPlaces } = localization;
    if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 8) {
      throw new TenantSettingsValidationError(
        'localization.decimalPlaces must be between 0 and 8',
        PlatformErrorCode.SETTINGS_DECIMAL_PLACES_INVALID,
        'localization.decimalPlaces',
      );
    }
  }
}
