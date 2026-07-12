import { HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { mapSharedAddressError } from '../../../../shared/http/address-validation-error.mapper';
import { mapSharedVoError } from '../../../../shared/http/vo-validation-error.mapper';
import {
  LastActiveManagerError,
  StaffAlreadyActiveError,
  StaffAlreadyExistsError,
  StaffDeactivatedError,
  StaffDomainError,
  StaffEmailMismatchError,
  StaffGoogleAccountConflictError,
  StaffNotFoundError,
  StaffSelfDeactivationError,
  StaffSelfReactivationError,
} from '../../domain/errors/staff-domain.error';

export function mapStaffError(err: unknown): never {
  mapSharedAddressError(err);
  mapSharedVoError(err);
  if (err instanceof StaffNotFoundError) {
    throw throwProblemDetail(HttpStatus.NOT_FOUND, err.code, err.message, err.field);
  }
  if (err instanceof StaffAlreadyActiveError) {
    throw throwProblemDetail(HttpStatus.CONFLICT, err.code, err.message, err.field);
  }
  if (err instanceof StaffAlreadyExistsError) {
    throw throwProblemDetail(HttpStatus.CONFLICT, err.code, err.message, err.field);
  }
  if (err instanceof StaffSelfDeactivationError) {
    throw throwProblemDetail(HttpStatus.FORBIDDEN, err.code, err.message, err.field);
  }
  if (err instanceof StaffSelfReactivationError) {
    throw throwProblemDetail(HttpStatus.FORBIDDEN, err.code, err.message, err.field);
  }
  if (err instanceof LastActiveManagerError) {
    throw throwProblemDetail(HttpStatus.CONFLICT, err.code, err.message, err.field);
  }
  if (err instanceof StaffDeactivatedError) {
    throw throwProblemDetail(HttpStatus.FORBIDDEN, err.code, err.message, err.field);
  }
  if (err instanceof StaffGoogleAccountConflictError) {
    throw throwProblemDetail(HttpStatus.CONFLICT, err.code, err.message, err.field);
  }
  if (err instanceof StaffEmailMismatchError) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message, err.field);
  }
  if (err instanceof StaffDomainError) {
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message, err.field);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
