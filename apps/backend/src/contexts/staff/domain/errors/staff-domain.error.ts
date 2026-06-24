export class StaffDomainError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'StaffDomainError';
  }
}

export class StaffNotFoundError extends StaffDomainError {
  constructor(identifier: string) {
    super(`Staff member not found: ${identifier}`);
    this.name = 'StaffNotFoundError';
  }
}

export class StaffAlreadyActiveError extends StaffDomainError {
  constructor(staffId: string) {
    super(`Staff member ${staffId} is already active`);
    this.name = 'StaffAlreadyActiveError';
  }
}

export class StaffDeactivatedError extends StaffDomainError {
  constructor() {
    super('Staff account is deactivated');
    this.name = 'StaffDeactivatedError';
  }
}

export class StaffEmailMismatchError extends StaffDomainError {
  constructor() {
    super('The Google account email does not match the invited email address');
    this.name = 'StaffEmailMismatchError';
  }
}

export class StaffAlreadyExistsError extends StaffDomainError {
  constructor(email: string) {
    super(`Staff with email ${email} already exists in this tenant`);
    this.name = 'StaffAlreadyExistsError';
  }
}

export class StaffSelfDeactivationError extends StaffDomainError {
  constructor() {
    super('Cannot deactivate your own account');
    this.name = 'StaffSelfDeactivationError';
  }
}

export class LastActiveManagerError extends StaffDomainError {
  constructor() {
    super('Cannot remove the last active manager');
    this.name = 'LastActiveManagerError';
  }
}

export class StaffGoogleAccountConflictError extends StaffDomainError {
  constructor() {
    super('This Google account is already linked to a different staff member');
    this.name = 'StaffGoogleAccountConflictError';
  }
}
