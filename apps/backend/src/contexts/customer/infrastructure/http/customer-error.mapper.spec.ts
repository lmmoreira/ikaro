import { HttpException, HttpStatus } from '@nestjs/common';
import { AddressErrorCode, CountryCodeErrorCode, CustomerErrorCode } from '@ikaro/types';
import { AddressValidationError } from '../../../../shared/value-objects/address';
import { CountryCodeValidationError } from '../../../../shared/value-objects/country-code.vo';
import {
  CustomerAddressValidationError,
  CustomerDomainError,
  CustomerNotFoundError,
} from '../../domain/errors/customer-domain.error';
import { mapCustomerError } from './customer-error.mapper';

function call(err: unknown): HttpException {
  try {
    mapCustomerError(err);
    throw new Error('mapCustomerError should have thrown');
  } catch (e) {
    return e as HttpException;
  }
}

describe('mapCustomerError', () => {
  it('maps CustomerAddressValidationError to 400 with code and field', () => {
    const err = call(
      new CustomerAddressValidationError('Invalid CEP: 123', AddressErrorCode.POSTAL_CODE_INVALID),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({
      code: AddressErrorCode.POSTAL_CODE_INVALID,
      field: 'contactAddress',
    });
  });

  it('maps AddressValidationError to 400 with code', () => {
    const err = call(
      new AddressValidationError('Invalid CEP: 123', AddressErrorCode.POSTAL_CODE_INVALID),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: AddressErrorCode.POSTAL_CODE_INVALID });
  });

  it('maps CountryCodeValidationError to 400 with code', () => {
    const err = call(
      new CountryCodeValidationError(
        'countryCode must be supported',
        CountryCodeErrorCode.UNSUPPORTED,
      ),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: CountryCodeErrorCode.UNSUPPORTED });
  });

  it('maps CustomerNotFoundError to 404 with code', () => {
    const err = call(new CustomerNotFoundError('some-id'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(err.getResponse()).toMatchObject({ code: CustomerErrorCode.NOT_FOUND });
  });

  it('maps generic CustomerDomainError to 400, preserving the code carried on the instance', () => {
    const err = call(new CustomerDomainError('invalid state', CustomerErrorCode.NAME_REQUIRED));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: CustomerErrorCode.NAME_REQUIRED });
  });

  it('re-throws plain Error instances unchanged', () => {
    const err = new Error('network failure');
    expect(() => mapCustomerError(err)).toThrow(err);
  });

  it('wraps unknown non-Error values in an Error', () => {
    expect(() => mapCustomerError('unexpected string')).toThrow(Error);
  });
});
