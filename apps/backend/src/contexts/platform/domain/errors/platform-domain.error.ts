import { PlatformErrorCode } from '@ikaro/types';
import { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';

export class PlatformDomainError extends Error implements DomainErrorShape {
  readonly code: PlatformErrorCode;
  readonly field?: string;

  constructor(message: string, code: PlatformErrorCode, field?: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'PlatformDomainError';
    this.code = code;
    this.field = field;
  }
}

export class SlugAlreadyTakenError extends PlatformDomainError {
  constructor(slug: string) {
    super(`Slug '${slug}' is already in use`, PlatformErrorCode.SLUG_ALREADY_TAKEN, 'slug');
    this.name = 'SlugAlreadyTakenError';
  }
}

export class TenantNotFoundError extends PlatformDomainError {
  constructor(tenantId: string) {
    super(`Tenant '${tenantId}' not found`, PlatformErrorCode.TENANT_NOT_FOUND);
    this.name = 'TenantNotFoundError';
  }
}

export class TenantInactiveError extends PlatformDomainError {
  constructor(tenantId: string) {
    super(
      `Tenant '${tenantId}' is inactive and cannot be modified`,
      PlatformErrorCode.TENANT_INACTIVE,
    );
    this.name = 'TenantInactiveError';
  }
}

export class HotsiteNotFoundError extends PlatformDomainError {
  constructor(tenantId: string) {
    super(`Hotsite config for tenant '${tenantId}' not found`, PlatformErrorCode.HOTSITE_NOT_FOUND);
    this.name = 'HotsiteNotFoundError';
  }
}

export class HotsiteImageNotUploadedError extends PlatformDomainError {
  constructor(storagePath: string) {
    super(
      `Image was not found in storage: ${storagePath}`,
      PlatformErrorCode.HOTSITE_IMAGE_NOT_UPLOADED,
    );
    this.name = 'HotsiteImageNotUploadedError';
  }
}

/** Thrown from both Tenant.create() and Tenant.updateName() — reused across 2 call sites. */
export class TenantNameRequiredError extends PlatformDomainError {
  constructor() {
    super('Tenant name must not be empty', PlatformErrorCode.TENANT_NAME_REQUIRED, 'name');
    this.name = 'TenantNameRequiredError';
  }
}

export class TenantSlugInvalidError extends PlatformDomainError {
  constructor() {
    super(
      'Tenant slug must only contain lowercase letters, numbers, and hyphens',
      PlatformErrorCode.TENANT_SLUG_INVALID,
      'slug',
    );
    this.name = 'TenantSlugInvalidError';
  }
}

export class HotsiteNoEnabledModulesError extends PlatformDomainError {
  constructor() {
    super(
      'Cannot publish hotsite with no enabled modules',
      PlatformErrorCode.HOTSITE_NO_ENABLED_MODULES,
    );
    this.name = 'HotsiteNoEnabledModulesError';
  }
}

/** Thrown from the required and optional hex-color field loops — reused across both. */
export class HotsiteBrandingColorInvalidError extends PlatformDomainError {
  constructor(field: string) {
    super(
      `${field} must be a valid hex color (e.g. #FF5733)`,
      PlatformErrorCode.HOTSITE_BRANDING_COLOR_INVALID,
      `branding.${field}`,
    );
    this.name = 'HotsiteBrandingColorInvalidError';
  }
}

/** Thrown by validateEnum() — reused across borderRadius/buttonStyle/spacing/shadowStyle/heroBgStyle/dividerStyle. */
export class HotsiteBrandingOptionInvalidError extends PlatformDomainError {
  constructor(field: string, allowed: readonly string[]) {
    super(
      `${field} must be one of: ${allowed.join(', ')}`,
      PlatformErrorCode.HOTSITE_BRANDING_OPTION_INVALID,
      `branding.${field}`,
    );
    this.name = 'HotsiteBrandingOptionInvalidError';
  }
}

export class HotsiteModuleTypeInvalidError extends PlatformDomainError {
  constructor(moduleType: string) {
    super(
      `Unknown hotsite module type: '${moduleType}'`,
      PlatformErrorCode.HOTSITE_MODULE_TYPE_INVALID,
    );
    this.name = 'HotsiteModuleTypeInvalidError';
  }
}

export class HotsiteSeoTitleTooLongError extends PlatformDomainError {
  constructor(maxLength: number) {
    super(
      `seo.title must be at most ${maxLength} characters`,
      PlatformErrorCode.HOTSITE_SEO_TITLE_TOO_LONG,
      'seo.title',
    );
    this.name = 'HotsiteSeoTitleTooLongError';
  }
}

export class HotsiteSeoDescriptionTooLongError extends PlatformDomainError {
  constructor(maxLength: number) {
    super(
      `seo.description must be at most ${maxLength} characters`,
      PlatformErrorCode.HOTSITE_SEO_DESCRIPTION_TOO_LONG,
      'seo.description',
    );
    this.name = 'HotsiteSeoDescriptionTooLongError';
  }
}

/**
 * Relocated from `domain/value-objects/tenant-settings.vo.ts` (TD23 Story 7) for consistency
 * with every other named platform error living in `domain/errors/`. Kept as a single class
 * with a `code`/`field` constructor param (mirrors AddressValidationError's shape) rather than
 * split into ~23 named subclasses — TenantSettings validates many independent internal fields
 * the same way Address does, not distinct aggregate-level business rules.
 */
export class TenantSettingsValidationError extends PlatformDomainError {
  constructor(message: string, code: PlatformErrorCode, field?: string) {
    super(message, code, field);
    this.name = 'TenantSettingsValidationError';
  }
}
