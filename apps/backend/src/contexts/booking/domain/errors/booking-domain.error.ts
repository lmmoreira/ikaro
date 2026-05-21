export class BookingDomainError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'BookingDomainError';
  }
}

export class ServiceNotFoundError extends BookingDomainError {
  constructor(id: string) {
    super(`Service not found: ${id}`);
    this.name = 'ServiceNotFoundError';
  }
}

export class ServiceDeactivatedError extends BookingDomainError {
  constructor() {
    super('Cannot update a deactivated service');
    this.name = 'ServiceDeactivatedError';
  }
}
