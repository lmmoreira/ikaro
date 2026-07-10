import { HttpException, HttpStatus } from '@nestjs/common';
import { AddressErrorCode, CountryCodeErrorCode } from '@ikaro/types';
import { AddressValidationError } from '../../../../shared/value-objects/address';
import { CountryCodeValidationError } from '../../../../shared/value-objects/country-code.vo';
import { TenantSettingsValidationError } from '../../domain/value-objects/tenant-settings.vo';
import { mapPlatformError } from './platform-error.mapper';

function call(err: unknown): HttpException {
  try {
    mapPlatformError(err);
    throw new Error('mapPlatformError should have thrown');
  } catch (e) {
    return e as HttpException;
  }
}

describe('mapPlatformError', () => {
  it('maps AddressValidationError to 400', () => {
    const err = call(
      new AddressValidationError('Invalid CEP: 123', AddressErrorCode.POSTAL_CODE_INVALID),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('maps CountryCodeValidationError to 400', () => {
    const err = call(
      new CountryCodeValidationError(
        'countryCode must be supported',
        CountryCodeErrorCode.UNSUPPORTED,
      ),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('maps TenantSettingsValidationError to 400', () => {
    const err = call(new TenantSettingsValidationError('localization.countryCode must be valid'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });
});
