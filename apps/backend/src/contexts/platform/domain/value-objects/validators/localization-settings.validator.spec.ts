import { PlatformErrorCode } from '@ikaro/types';
import type { LocalizationSettings } from '../../../../../shared/value-objects/tenant-settings-data';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';
import { LocalizationSettingsValidator } from './localization-settings.validator';

const VALID: LocalizationSettings = {
  countryCode: 'BR',
  currency: 'BRL',
  currencySymbol: 'R$',
  language: 'pt-BR',
  decimalPlaces: 2,
};

function expectCode(localization: LocalizationSettings, code: string): void {
  let err: unknown;
  try {
    LocalizationSettingsValidator.validate(localization);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(TenantSettingsValidationError);
  expect((err as TenantSettingsValidationError).code).toBe(code);
}

describe('LocalizationSettingsValidator', () => {
  it('accepts valid settings', () => {
    expect(() => LocalizationSettingsValidator.validate(VALID)).not.toThrow();
  });

  it('accepts a missing currencySymbol', () => {
    const rest: LocalizationSettings = { ...VALID };
    delete rest.currencySymbol;
    expect(() => LocalizationSettingsValidator.validate(rest)).not.toThrow();
  });

  it('rejects an empty currency', () => {
    expectCode({ ...VALID, currency: '' }, PlatformErrorCode.SETTINGS_CURRENCY_REQUIRED);
  });

  it('rejects an empty language', () => {
    expectCode({ ...VALID, language: '' }, PlatformErrorCode.SETTINGS_LANGUAGE_REQUIRED);
  });

  it('rejects a currencySymbol longer than 3 characters', () => {
    expectCode(
      { ...VALID, currencySymbol: 'TOOLONG' },
      PlatformErrorCode.SETTINGS_CURRENCY_SYMBOL_INVALID,
    );
  });

  it('rejects decimalPlaces outside 0-8', () => {
    expectCode({ ...VALID, decimalPlaces: 9 }, PlatformErrorCode.SETTINGS_DECIMAL_PLACES_INVALID);
  });
});
