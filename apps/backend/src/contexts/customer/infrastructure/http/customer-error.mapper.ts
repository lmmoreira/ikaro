import { HttpException, HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { mapSharedAddressError } from '../../../../shared/http/address-validation-error.mapper';
import { mapSharedVoError } from '../../../../shared/http/vo-validation-error.mapper';
import { ProblemDetail } from '@ikaro/types';
import {
  CustomerAddressValidationError,
  CustomerDomainError,
  CustomerNotFoundError,
} from '../../domain/errors/customer-domain.error';

export function mapCustomerError(err: unknown): never {
  if (err instanceof CustomerAddressValidationError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      code: err.code,
      field: err.field,
      params: err.params,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.BAD_REQUEST);
  }
  mapSharedAddressError(err);
  mapSharedVoError(err);
  if (err instanceof CustomerNotFoundError) {
    throw throwProblemDetail(HttpStatus.NOT_FOUND, err.code, err.message, err.field);
  }
  if (err instanceof CustomerDomainError) {
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message, err.field);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
