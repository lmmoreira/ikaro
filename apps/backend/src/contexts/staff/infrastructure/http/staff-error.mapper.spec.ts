import { HttpException, HttpStatus } from '@nestjs/common';
import {
  LastActiveManagerError,
  StaffAlreadyActiveError,
  StaffAlreadyExistsError,
  StaffDomainError,
  StaffEmailMismatchError,
  StaffGoogleAccountConflictError,
  StaffNotFoundError,
  StaffSelfDeactivationError,
} from '../../domain/errors/staff-domain.error';
import { mapStaffError } from './staff-error.mapper';

describe('mapStaffError', () => {
  it('maps StaffNotFoundError to 404', () => {
    expect(() => mapStaffError(new StaffNotFoundError('some-id'))).toThrow(HttpException);
    try {
      mapStaffError(new StaffNotFoundError('some-id'));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    }
  });

  it('maps StaffAlreadyActiveError to 409', () => {
    expect(() => mapStaffError(new StaffAlreadyActiveError('some-id'))).toThrow(HttpException);
    try {
      mapStaffError(new StaffAlreadyActiveError('some-id'));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    }
  });

  it('maps StaffAlreadyExistsError to 409', () => {
    expect(() => mapStaffError(new StaffAlreadyExistsError('a@b.com'))).toThrow(HttpException);
    try {
      mapStaffError(new StaffAlreadyExistsError('a@b.com'));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    }
  });

  it('maps StaffSelfDeactivationError to 403', () => {
    expect(() => mapStaffError(new StaffSelfDeactivationError())).toThrow(HttpException);
    try {
      mapStaffError(new StaffSelfDeactivationError());
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });

  it('maps LastActiveManagerError to 409', () => {
    expect(() => mapStaffError(new LastActiveManagerError())).toThrow(HttpException);
    try {
      mapStaffError(new LastActiveManagerError());
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    }
  });

  it('maps StaffEmailMismatchError to 422', () => {
    expect(() => mapStaffError(new StaffEmailMismatchError())).toThrow(HttpException);
    try {
      mapStaffError(new StaffEmailMismatchError());
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    }
  });

  it('maps StaffGoogleAccountConflictError to 409', () => {
    expect(() => mapStaffError(new StaffGoogleAccountConflictError())).toThrow(HttpException);
    try {
      mapStaffError(new StaffGoogleAccountConflictError());
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    }
  });

  it('maps generic StaffDomainError to 400', () => {
    expect(() => mapStaffError(new StaffDomainError('invalid'))).toThrow(HttpException);
    try {
      mapStaffError(new StaffDomainError('invalid'));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('re-throws plain Error instances unchanged', () => {
    const err = new Error('unexpected');
    expect(() => mapStaffError(err)).toThrow(err);
  });

  it('wraps unknown non-Error values in an Error', () => {
    expect(() => mapStaffError('unexpected string')).toThrow(Error);
  });
});
