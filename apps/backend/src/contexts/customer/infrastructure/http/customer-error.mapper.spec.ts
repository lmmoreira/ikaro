import { HttpException, HttpStatus } from '@nestjs/common';
import { AddressValidationError } from '../../../../shared/value-objects/address';
import {
  CustomerDomainError,
  CustomerNotFoundError,
} from '../../domain/errors/customer-domain.error';
import { mapCustomerError } from './customer-error.mapper';

describe('mapCustomerError', () => {
  it('maps AddressValidationError to 400', () => {
    const err = new AddressValidationError('Invalid CEP: 123');
    expect(() => mapCustomerError(err)).toThrow(HttpException);
    try {
      mapCustomerError(err);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('maps CustomerNotFoundError to 404', () => {
    const err = new CustomerNotFoundError('some-id');
    expect(() => mapCustomerError(err)).toThrow(HttpException);
    try {
      mapCustomerError(err);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    }
  });

  it('maps generic CustomerDomainError to 400', () => {
    const err = new CustomerDomainError('invalid state');
    expect(() => mapCustomerError(err)).toThrow(HttpException);
    try {
      mapCustomerError(err);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('re-throws plain Error instances unchanged', () => {
    const err = new Error('network failure');
    expect(() => mapCustomerError(err)).toThrow(err);
  });

  it('wraps unknown non-Error values in an Error', () => {
    expect(() => mapCustomerError('unexpected string')).toThrow(Error);
  });
});
