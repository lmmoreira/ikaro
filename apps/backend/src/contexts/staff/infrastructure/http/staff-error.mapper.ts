import { HttpException, HttpStatus } from '@nestjs/common';
import { mapSharedAddressError } from '../../../../shared/http/address-validation-error.mapper';
import { mapSharedVoError } from '../../../../shared/http/vo-validation-error.mapper';
import { ProblemDetail } from '@ikaro/types';
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
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Not Found',
      status: HttpStatus.NOT_FOUND,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.NOT_FOUND);
  }
  if (err instanceof StaffAlreadyActiveError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.CONFLICT);
  }
  if (err instanceof StaffAlreadyExistsError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.CONFLICT);
  }
  if (err instanceof StaffSelfDeactivationError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Forbidden',
      status: HttpStatus.FORBIDDEN,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.FORBIDDEN);
  }
  if (err instanceof StaffSelfReactivationError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Forbidden',
      status: HttpStatus.FORBIDDEN,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.FORBIDDEN);
  }
  if (err instanceof LastActiveManagerError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.CONFLICT);
  }
  if (err instanceof StaffDeactivatedError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Forbidden',
      status: HttpStatus.FORBIDDEN,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.FORBIDDEN);
  }
  if (err instanceof StaffGoogleAccountConflictError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.CONFLICT);
  }
  if (err instanceof StaffEmailMismatchError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Unprocessable Content',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.UNPROCESSABLE_ENTITY);
  }
  if (err instanceof StaffDomainError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.BAD_REQUEST);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
