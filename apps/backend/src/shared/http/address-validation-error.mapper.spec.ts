import { HttpException, HttpStatus } from '@nestjs/common';
import { AddressErrorCode, CountryCodeErrorCode } from '@ikaro/types';
import { AddressValidationError } from '../value-objects/address';
import { CountryCodeValidationError } from '../value-objects/country-code.vo';
import { mapSharedAddressError } from './address-validation-error.mapper';

describe('mapSharedAddressError', () => {
  it('maps AddressValidationError to 400 with code and params', () => {
    let caught: unknown;
    try {
      mapSharedAddressError(
        new AddressValidationError('Invalid CEP: 123', AddressErrorCode.POSTAL_CODE_INVALID, {
          field: 'zipCode',
        }),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect((caught as HttpException).getResponse()).toMatchObject({
      code: AddressErrorCode.POSTAL_CODE_INVALID,
      params: { field: 'zipCode' },
    });
  });

  it('maps CountryCodeValidationError to 400 with code', () => {
    let caught: unknown;
    try {
      mapSharedAddressError(
        new CountryCodeValidationError(
          'countryCode must be supported',
          CountryCodeErrorCode.UNSUPPORTED,
        ),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect((caught as HttpException).getResponse()).toMatchObject({
      code: CountryCodeErrorCode.UNSUPPORTED,
    });
  });

  it('returns without throwing for any other error', () => {
    expect(() => mapSharedAddressError(new Error('unrelated'))).not.toThrow();
  });
});
