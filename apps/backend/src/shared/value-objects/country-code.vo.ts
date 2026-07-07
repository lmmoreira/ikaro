import { type CountrySpec, countrySpec, isSupportedCountryCode } from '@ikaro/i18n';
import { ValueObject } from '../domain/value-object';

interface CountryCodeProps {
  value: string;
}

export class CountryCodeValidationError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'CountryCodeValidationError';
  }
}

export class CountryCode extends ValueObject<CountryCodeProps> {
  private constructor(props: CountryCodeProps) {
    super(props);
  }

  static isValid(code: string): boolean {
    if (typeof code !== 'string') return false;
    const normalizedCode = code.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(normalizedCode) && isSupportedCountryCode(normalizedCode);
  }

  static create(code: string): CountryCode {
    const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
    if (!/^[A-Z]{2}$/.test(normalizedCode)) {
      throw new CountryCodeValidationError(
        'countryCode must be a 2-letter ISO 3166-1 alpha-2 code',
      );
    }
    if (!isSupportedCountryCode(normalizedCode)) {
      throw new CountryCodeValidationError(
        `countryCode must be a supported country code: ${normalizedCode}`,
      );
    }
    return new CountryCode({ value: normalizedCode });
  }

  static reconstitute(value: string): CountryCode {
    return new CountryCode({ value });
  }

  get value(): string {
    return this.props.value;
  }

  get spec(): CountrySpec {
    return countrySpec(this.props.value);
  }

  toString(): string {
    return this.props.value;
  }
}
