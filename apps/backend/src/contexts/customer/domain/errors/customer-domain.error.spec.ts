import { AddressErrorCode, CountryCodeErrorCode, CustomerErrorCode } from '@ikaro/types';
import {
  CustomerAddressValidationError,
  CustomerDomainError,
  CustomerNotFoundError,
} from './customer-domain.error';

describe('CustomerDomainError (base class)', () => {
  it('sets name, code, field and is a real Error instance', () => {
    const err = new CustomerDomainError(
      'something went wrong',
      CustomerErrorCode.NAME_REQUIRED,
      'someField',
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CustomerDomainError);
    expect(err.name).toBe('CustomerDomainError');
    expect(err.code).toBe(CustomerErrorCode.NAME_REQUIRED);
    expect(err.field).toBe('someField');
    expect(err.message).toBe('something went wrong');
  });

  it('leaves field undefined when not provided', () => {
    const err = new CustomerDomainError('x', CustomerErrorCode.NAME_REQUIRED);
    expect(err.field).toBeUndefined();
  });
});

describe('CustomerNotFoundError', () => {
  it('extends CustomerDomainError and carries its code', () => {
    const err = new CustomerNotFoundError('cust-1');
    expect(err).toBeInstanceOf(CustomerDomainError);
    expect(err.code).toBe(CustomerErrorCode.NOT_FOUND);
    expect(err.message).toBe('Customer not found: cust-1');
  });
});

describe('CustomerAddressValidationError', () => {
  it('does not extend CustomerDomainError, but implements the same DomainErrorShape', () => {
    const err = new CustomerAddressValidationError(
      'Invalid CEP: 123',
      AddressErrorCode.POSTAL_CODE_INVALID,
      { field: 'zipCode' },
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(CustomerDomainError);
    expect(err.name).toBe('CustomerAddressValidationError');
    expect(err.code).toBe(AddressErrorCode.POSTAL_CODE_INVALID);
    expect(err.field).toBe('contactAddress');
    expect(err.params).toEqual({ field: 'zipCode' });
  });

  it('accepts a CountryCodeErrorCode as well as an AddressErrorCode', () => {
    const err = new CustomerAddressValidationError(
      'countryCode must be supported',
      CountryCodeErrorCode.UNSUPPORTED,
    );
    expect(err.code).toBe(CountryCodeErrorCode.UNSUPPORTED);
    expect(err.field).toBe('contactAddress');
    expect(err.params).toBeUndefined();
  });
});
