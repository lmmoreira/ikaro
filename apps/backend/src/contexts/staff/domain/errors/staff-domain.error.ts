import { StaffErrorCode } from '@ikaro/types';
import { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';

export class StaffDomainError extends Error implements DomainErrorShape {
  readonly code: StaffErrorCode;
  readonly field?: string;

  constructor(message: string, code: StaffErrorCode, field?: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'StaffDomainError';
    this.code = code;
    this.field = field;
  }
}

export class StaffNotFoundError extends StaffDomainError {
  constructor(identifier: string) {
    super(`Staff member not found: ${identifier}`, StaffErrorCode.NOT_FOUND);
    this.name = 'StaffNotFoundError';
  }
}

export class StaffAlreadyActiveError extends StaffDomainError {
  constructor(staffId: string) {
    super(`Staff member ${staffId} is already active`, StaffErrorCode.ALREADY_ACTIVE);
    this.name = 'StaffAlreadyActiveError';
  }
}

export class StaffDeactivatedError extends StaffDomainError {
  constructor() {
    super('Staff account is deactivated', StaffErrorCode.DEACTIVATED);
    this.name = 'StaffDeactivatedError';
  }
}

/**
 * Security review (TD23 §10, Story 5): kept as a specific code, not collapsed. This error
 * is only reachable via internal/staff/:staffId/link-google — a network-internal,
 * BFF-only endpoint where staffId is already resolved server-side by the BFF before this
 * call (never attacker-supplied). The BFF's mapStaffLinkError already collapses this into
 * a generic StaffLoginFailureReason for the redirect, so no specific code from here ever
 * reaches the browser — that collapsing boundary is TD23 Story 11's scope, not this one.
 */
export class StaffEmailMismatchError extends StaffDomainError {
  constructor() {
    super(
      'The Google account email does not match the invited email address',
      StaffErrorCode.EMAIL_MISMATCH,
    );
    this.name = 'StaffEmailMismatchError';
  }
}

export class StaffAlreadyExistsError extends StaffDomainError {
  constructor(email: string) {
    super(`Staff with email ${email} already exists in this tenant`, StaffErrorCode.ALREADY_EXISTS);
    this.name = 'StaffAlreadyExistsError';
  }
}

export class StaffSelfDeactivationError extends StaffDomainError {
  constructor() {
    super('Cannot deactivate your own account', StaffErrorCode.SELF_DEACTIVATION);
    this.name = 'StaffSelfDeactivationError';
  }
}

export class StaffSelfReactivationError extends StaffDomainError {
  constructor() {
    super('Cannot reactivate your own account', StaffErrorCode.SELF_REACTIVATION);
    this.name = 'StaffSelfReactivationError';
  }
}

export class LastActiveManagerError extends StaffDomainError {
  constructor() {
    super('Cannot remove the last active manager', StaffErrorCode.LAST_ACTIVE_MANAGER);
    this.name = 'LastActiveManagerError';
  }
}

/** See StaffEmailMismatchError's comment above — same security-review conclusion applies. */
export class StaffGoogleAccountConflictError extends StaffDomainError {
  constructor() {
    super(
      'This Google account is already linked to a different staff member',
      StaffErrorCode.GOOGLE_ACCOUNT_CONFLICT,
    );
    this.name = 'StaffGoogleAccountConflictError';
  }
}

/** Thrown from both Staff.invite() and Staff.inviteFromProvisioning() — reused across 2 call sites. */
export class StaffTenantIdRequiredError extends StaffDomainError {
  constructor() {
    super('tenantId is required', StaffErrorCode.TENANT_ID_REQUIRED);
    this.name = 'StaffTenantIdRequiredError';
  }
}

/** Thrown from both Staff.invite() and Staff.inviteFromProvisioning() — reused across 2 call sites. */
export class StaffEmailInvalidError extends StaffDomainError {
  constructor() {
    super('email must be a valid email address', StaffErrorCode.EMAIL_INVALID);
    this.name = 'StaffEmailInvalidError';
  }
}

/**
 * Thrown from Staff.invite(), linkGoogleAccount(), reinvite() and updateProfile() — same
 * "name is required" condition, reused across 4 call sites with slightly different wording
 * per site. `field: 'name'` applies where name is a real submitted form field (invite,
 * reinvite, updateProfile); linkGoogleAccount()'s name comes from the Google OAuth
 * profile, not a user-submitted field, so it's omitted there — mirrors
 * CustomerNameRequiredError's rule.
 */
export class StaffNameRequiredError extends StaffDomainError {
  constructor(message: string, field?: 'name') {
    super(message, StaffErrorCode.NAME_REQUIRED, field);
    this.name = 'StaffNameRequiredError';
  }
}

export class StaffRoleInvalidError extends StaffDomainError {
  constructor() {
    super('role must be MANAGER or STAFF', StaffErrorCode.ROLE_INVALID, 'role');
    this.name = 'StaffRoleInvalidError';
  }
}

export class StaffGoogleOAuthIdRequiredError extends StaffDomainError {
  constructor() {
    super('googleOAuthId is required', StaffErrorCode.GOOGLE_OAUTH_ID_REQUIRED);
    this.name = 'StaffGoogleOAuthIdRequiredError';
  }
}
