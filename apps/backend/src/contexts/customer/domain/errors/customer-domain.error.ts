import { AddressErrorCode, CountryCodeErrorCode, CustomerErrorCode } from '@ikaro/types';
import { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';

export class CustomerDomainError extends Error implements DomainErrorShape {
  readonly code: CustomerErrorCode;
  readonly field?: string;

  constructor(message: string, code: CustomerErrorCode, field?: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'CustomerDomainError';
    this.code = code;
    this.field = field;
  }
}

export class CustomerNotFoundError extends CustomerDomainError {
  constructor(customerId: string) {
    super(`Customer not found: ${customerId}`, CustomerErrorCode.NOT_FOUND);
    this.name = 'CustomerNotFoundError';
  }
}

/**
 * Thrown from both Customer.create() and Customer.updateProfile() — unlike the other
 * single-site validation failures in this file, this condition is reused across two
 * call sites, so it gets a named subclass rather than a raw code-param throw (same rule
 * booking applied to TenantIdRequiredError/CreatedByRequiredError). `field: 'name'` only
 * applies at updateProfile() (a real PATCH /customers/me body field) — create()'s name
 * comes from the Google OAuth profile, not a user-submitted form field.
 */
export class CustomerNameRequiredError extends CustomerDomainError {
  constructor(field?: 'name') {
    super('name must not be empty', CustomerErrorCode.NAME_REQUIRED, field);
    this.name = 'CustomerNameRequiredError';
  }
}

/**
 * Customer-owned translation of a VO-level address/country-code validation failure.
 * Deliberately does NOT extend CustomerDomainError: its `code` belongs to the
 * AddressErrorCode/CountryCodeErrorCode namespace, not CustomerErrorCode — forcing a
 * fake customer-origin code would misrepresent the type or lose the per-rule specificity
 * the underlying VO error already carries. Implements DomainErrorShape directly instead.
 */
export class CustomerAddressValidationError extends Error implements DomainErrorShape {
  readonly code: AddressErrorCode | CountryCodeErrorCode;
  readonly field: 'contactAddress';
  readonly params?: Record<string, string | number>;

  constructor(
    message: string,
    code: AddressErrorCode | CountryCodeErrorCode,
    params?: Record<string, string | number>,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'CustomerAddressValidationError';
    this.code = code;
    this.field = 'contactAddress';
    this.params = params;
  }
}
