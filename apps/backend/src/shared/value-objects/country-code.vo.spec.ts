import { countrySpec } from '@ikaro/i18n';
import { CountryCodeErrorCode } from '@ikaro/types';
import { CountryCode, CountryCodeValidationError } from './country-code.vo';

function captureError(fn: () => unknown): CountryCodeValidationError {
  try {
    fn();
    throw new Error('expected fn to throw CountryCodeValidationError');
  } catch (e) {
    return e as CountryCodeValidationError;
  }
}

describe('CountryCode', () => {
  it('normalizes lowercase input to uppercase and exposes the country spec', () => {
    const countryCode = CountryCode.create('br');

    expect(countryCode.value).toBe('BR');
    expect(countryCode.spec).toEqual(countrySpec('BR'));
  });

  it('rejects malformed country codes', () => {
    expect(() => CountryCode.create('b')).toThrow(CountryCodeValidationError);
  });

  it('carries COUNTRY_CODE_FORMAT_INVALID for a malformed code', () => {
    const err = captureError(() => CountryCode.create('b'));
    expect(err.code).toBe(CountryCodeErrorCode.FORMAT_INVALID);
  });

  it('rejects unsupported country codes', () => {
    expect(() => CountryCode.create('ZZ')).toThrow('countryCode must be a supported country code');
  });

  it('carries COUNTRY_CODE_UNSUPPORTED for an unsupported code', () => {
    const err = captureError(() => CountryCode.create('ZZ'));
    expect(err.code).toBe(CountryCodeErrorCode.UNSUPPORTED);
  });

  it('returns false from isValid for unsupported codes', () => {
    expect(CountryCode.isValid('ZZ')).toBe(false);
  });

  it('returns true from isValid for supported codes', () => {
    expect(CountryCode.isValid('us')).toBe(true);
  });
});
