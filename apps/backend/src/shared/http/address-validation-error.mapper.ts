import { HttpException, HttpStatus } from '@nestjs/common';
import { AddressValidationError } from '../value-objects/address';
import { CountryCodeValidationError } from '../value-objects/country-code.vo';
import { ProblemDetail } from '@ikaro/types';

/**
 * Shared branch for the two VO-level errors (Address, CountryCode) every context mapper
 * must handle identically — extracted to avoid re-duplicating this block per context
 * (SonarCloud new-code-duplication gate). Returns without throwing when `err` isn't one
 * of these two types, so callers can fall through to their own context-specific branches.
 */
export function mapSharedAddressError(err: unknown): void {
  if (err instanceof AddressValidationError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      code: err.code,
      params: err.params,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.BAD_REQUEST);
  }
  if (err instanceof CountryCodeValidationError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      code: err.code,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.BAD_REQUEST);
  }
}
