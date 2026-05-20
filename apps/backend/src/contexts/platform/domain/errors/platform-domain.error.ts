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
