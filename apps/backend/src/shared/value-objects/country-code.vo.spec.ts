import { countrySpec } from '@ikaro/i18n';
import { CountryCode, CountryCodeValidationError } from './country-code.vo';

describe('CountryCode', () => {
  it('normalizes lowercase input to uppercase and exposes the country spec', () => {
    const countryCode = CountryCode.create('br');

    expect(countryCode.value).toBe('BR');
    expect(countryCode.spec).toEqual(countrySpec('BR'));
  });

  it('rejects malformed country codes', () => {
    expect(() => CountryCode.create('b')).toThrow(CountryCodeValidationError);
  });

  it('rejects unsupported country codes', () => {
    expect(() => CountryCode.create('ZZ')).toThrow('countryCode must be a supported country code');
  });

  it('returns false from isValid for unsupported codes', () => {
    expect(CountryCode.isValid('ZZ')).toBe(false);
  });

  it('returns true from isValid for supported codes', () => {
    expect(CountryCode.isValid('us')).toBe(true);
  });
});
