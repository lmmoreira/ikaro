export class PlatformDomainError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'PlatformDomainError';
  }
}

export class SlugAlreadyTakenError extends PlatformDomainError {
  constructor(slug: string) {
    super(`Slug '${slug}' is already in use`);
    this.name = 'SlugAlreadyTakenError';
  }
}

export class TenantNotFoundError extends PlatformDomainError {
  constructor(tenantId: string) {
    super(`Tenant '${tenantId}' not found`);
    this.name = 'TenantNotFoundError';
  }
}

export class TenantInactiveError extends PlatformDomainError {
  constructor(tenantId: string) {
    super(`Tenant '${tenantId}' is inactive and cannot be modified`);
    this.name = 'TenantInactiveError';
  }
}

export class HotsiteNotFoundError extends PlatformDomainError {
  constructor(tenantId: string) {
    super(`Hotsite config for tenant '${tenantId}' not found`);
    this.name = 'HotsiteNotFoundError';
  }
}

export class HotsiteNotPublishedError extends PlatformDomainError {
  constructor(tenantId: string) {
    super(`Hotsite for tenant '${tenantId}' is not published`);
    this.name = 'HotsiteNotPublishedError';
  }
}

export class HotsiteImageNotUploadedError extends PlatformDomainError {
  constructor(storagePath: string) {
    super(`Image was not found in storage: ${storagePath}`);
    this.name = 'HotsiteImageNotUploadedError';
  }
}

export class FeaturedBookingNotFoundError extends PlatformDomainError {
  constructor(bookingId: string) {
    super(`Booking '${bookingId}' not found`);
    this.name = 'FeaturedBookingNotFoundError';
  }
}

export class PhotoNotOnBookingError extends PlatformDomainError {
  constructor(photoUrl: string) {
    super(`Photo '${photoUrl}' was not found on the booking's before/after photo lists`);
    this.name = 'PhotoNotOnBookingError';
  }
}
