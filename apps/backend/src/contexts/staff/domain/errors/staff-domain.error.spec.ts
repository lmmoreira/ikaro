import { StaffErrorCode } from '@ikaro/types';
import {
  LastActiveManagerError,
  StaffAlreadyActiveError,
  StaffAlreadyExistsError,
  StaffDeactivatedError,
  StaffDomainError,
  StaffEmailInvalidError,
  StaffEmailMismatchError,
  StaffGoogleAccountConflictError,
  StaffGoogleOAuthIdRequiredError,
  StaffNameRequiredError,
  StaffNotFoundError,
  StaffRoleInvalidError,
  StaffSelfDeactivationError,
  StaffSelfReactivationError,
  StaffTenantIdRequiredError,
} from './staff-domain.error';

describe('StaffDomainError (base class)', () => {
  it('sets name, code, field and is a real Error instance', () => {
    const err = new StaffDomainError(
      'something went wrong',
      StaffErrorCode.NAME_REQUIRED,
      'someField',
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StaffDomainError);
    expect(err.name).toBe('StaffDomainError');
    expect(err.code).toBe(StaffErrorCode.NAME_REQUIRED);
    expect(err.field).toBe('someField');
    expect(err.message).toBe('something went wrong');
  });

  it('leaves field undefined when not provided', () => {
    const err = new StaffDomainError('x', StaffErrorCode.NAME_REQUIRED);
    expect(err.field).toBeUndefined();
  });
});

describe('StaffNotFoundError', () => {
  it('carries STAFF_NOT_FOUND', () => {
    const err = new StaffNotFoundError('staff-1');
    expect(err).toBeInstanceOf(StaffDomainError);
    expect(err.code).toBe(StaffErrorCode.NOT_FOUND);
  });
});

describe('StaffAlreadyActiveError', () => {
  it('carries STAFF_ALREADY_ACTIVE', () => {
    expect(new StaffAlreadyActiveError('staff-1').code).toBe(StaffErrorCode.ALREADY_ACTIVE);
  });
});

describe('StaffDeactivatedError', () => {
  it('carries STAFF_DEACTIVATED', () => {
    expect(new StaffDeactivatedError().code).toBe(StaffErrorCode.DEACTIVATED);
  });
});

describe('StaffEmailMismatchError', () => {
  it('carries STAFF_EMAIL_MISMATCH', () => {
    expect(new StaffEmailMismatchError().code).toBe(StaffErrorCode.EMAIL_MISMATCH);
  });
});

describe('StaffAlreadyExistsError', () => {
  it('carries STAFF_ALREADY_EXISTS', () => {
    expect(new StaffAlreadyExistsError('a@b.com').code).toBe(StaffErrorCode.ALREADY_EXISTS);
  });
});

describe('StaffSelfDeactivationError', () => {
  it('carries STAFF_SELF_DEACTIVATION', () => {
    expect(new StaffSelfDeactivationError().code).toBe(StaffErrorCode.SELF_DEACTIVATION);
  });
});

describe('StaffSelfReactivationError', () => {
  it('carries STAFF_SELF_REACTIVATION', () => {
    expect(new StaffSelfReactivationError().code).toBe(StaffErrorCode.SELF_REACTIVATION);
  });
});

describe('LastActiveManagerError', () => {
  it('carries STAFF_LAST_ACTIVE_MANAGER', () => {
    expect(new LastActiveManagerError().code).toBe(StaffErrorCode.LAST_ACTIVE_MANAGER);
  });
});

describe('StaffGoogleAccountConflictError', () => {
  it('carries STAFF_GOOGLE_ACCOUNT_CONFLICT', () => {
    expect(new StaffGoogleAccountConflictError().code).toBe(StaffErrorCode.GOOGLE_ACCOUNT_CONFLICT);
  });
});

describe('StaffTenantIdRequiredError', () => {
  it('carries STAFF_TENANT_ID_REQUIRED', () => {
    expect(new StaffTenantIdRequiredError().code).toBe(StaffErrorCode.TENANT_ID_REQUIRED);
  });
});

describe('StaffEmailInvalidError', () => {
  it('carries STAFF_EMAIL_INVALID', () => {
    expect(new StaffEmailInvalidError().code).toBe(StaffErrorCode.EMAIL_INVALID);
  });
});

describe('StaffNameRequiredError', () => {
  it('carries STAFF_NAME_REQUIRED with no field by default (linkGoogleAccount call site)', () => {
    const err = new StaffNameRequiredError('name is required');
    expect(err.code).toBe(StaffErrorCode.NAME_REQUIRED);
    expect(err.field).toBeUndefined();
  });

  it('carries field: "name" when constructed from a user-submitted-form call site', () => {
    const err = new StaffNameRequiredError('name is required to invite staff', 'name');
    expect(err.code).toBe(StaffErrorCode.NAME_REQUIRED);
    expect(err.field).toBe('name');
  });
});

describe('StaffRoleInvalidError', () => {
  it('carries STAFF_ROLE_INVALID with field: "role"', () => {
    const err = new StaffRoleInvalidError();
    expect(err.code).toBe(StaffErrorCode.ROLE_INVALID);
    expect(err.field).toBe('role');
  });
});

describe('StaffGoogleOAuthIdRequiredError', () => {
  it('carries STAFF_GOOGLE_OAUTH_ID_REQUIRED', () => {
    expect(new StaffGoogleOAuthIdRequiredError().code).toBe(
      StaffErrorCode.GOOGLE_OAUTH_ID_REQUIRED,
    );
  });
});
