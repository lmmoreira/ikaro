import { AddressErrorCode, CountryCodeErrorCode } from '@ikaro/types/protocol/errors';
import { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';

// Base class lives in its own file — see booking-domain-error.base.ts for why (breaks a
// circular-import that crashed backend boot under ts-node).
export { BookingDomainError } from './booking-domain-error.base';

/**
 * Booking-owned translation of a VO-level address/country-code validation failure.
 * Deliberately does NOT extend BookingDomainError: its `code` belongs to the
 * AddressErrorCode/CountryCodeErrorCode namespace, not BookingErrorCode — forcing a
 * fake booking-origin code would misrepresent the type or lose the per-rule specificity
 * the underlying VO error already carries. Implements DomainErrorShape directly instead.
 */
export class BookingAddressValidationError extends Error implements DomainErrorShape {
  readonly code: AddressErrorCode | CountryCodeErrorCode;
  readonly field: 'pickupAddress' | 'contactAddress';
  readonly params?: Record<string, string | number>;

  constructor(
    message: string,
    code: AddressErrorCode | CountryCodeErrorCode,
    field: 'pickupAddress' | 'contactAddress',
    params?: Record<string, string | number>,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'BookingAddressValidationError';
    this.code = code;
    this.field = field;
    this.params = params;
  }
}

// Split by sub-concern to satisfy docs/CODE_STANDARDS.md's file-length limit — this file's own
// call sites (booking-error.mapper.ts, use-cases, aggregates) are unaffected since every name
// still resolves from this same path.
export * from './booking-schedule.error';
export * from './booking-service.error';
export * from './booking-discount.error';
export * from './booking-lifecycle.error';
export * from './resource.error';
