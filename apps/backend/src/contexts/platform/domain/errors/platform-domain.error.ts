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

export class HotsiteConfigConcurrentModificationError extends PlatformDomainError {
  constructor() {
    super(
      'This hotsite configuration was changed by another request. Reload it and try again.',
      PlatformErrorCode.HOTSITE_CONCURRENT_MODIFICATION,
    );
    this.name = 'HotsiteConfigConcurrentModificationError';
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

export class HotsiteCarouselDaysExceedsMaxAdvanceError extends PlatformDomainError {
  constructor(carouselDays: number, maxBookingAdvanceDays: number) {
    super(
      `carouselDays (${carouselDays}) cannot exceed maxBookingAdvanceDays (${maxBookingAdvanceDays})`,
      PlatformErrorCode.HOTSITE_CAROUSEL_DAYS_EXCEEDS_MAX_ADVANCE,
      'carouselDays',
    );
    this.name = 'HotsiteCarouselDaysExceedsMaxAdvanceError';
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

/**
 * Chatbot cap-rejection errors (UC-033, docs/discovery/CHATBOT/CHATBOT.md §8) — all mapped to
 * HTTP 429 in platform-error.mapper.ts. Covers both layer 1 (tenant-wide) and layer 2 (per-IP)
 * daily caps: same visitor-facing outcome ("come back tomorrow"), same error code.
 */
export class ChatbotDailyCapReachedError extends PlatformDomainError {
  constructor() {
    super(
      "Tenant's daily chatbot conversation cap has been reached",
      PlatformErrorCode.CHATBOT_DAILY_CAP_REACHED,
    );
    this.name = 'ChatbotDailyCapReachedError';
  }
}

export class ChatbotConcurrencyCapReachedError extends PlatformDomainError {
  constructor() {
    super(
      "Tenant's concurrent chatbot conversation cap has been reached",
      PlatformErrorCode.CHATBOT_CONCURRENCY_CAP_REACHED,
    );
    this.name = 'ChatbotConcurrencyCapReachedError';
  }
}

export class ChatbotMessageCapReachedError extends PlatformDomainError {
  constructor() {
    super(
      'This conversation has reached its message cap',
      PlatformErrorCode.CHATBOT_MESSAGE_CAP_REACHED,
    );
    this.name = 'ChatbotMessageCapReachedError';
  }
}

/** Platform-wide backstop (layer 9) — never tenant-scoped, refuses new sessions for everyone. */
export class ChatbotGlobalSpendLimitReachedError extends PlatformDomainError {
  constructor() {
    super(
      'Platform-wide chatbot daily spend limit has been reached',
      PlatformErrorCode.CHATBOT_GLOBAL_SPEND_LIMIT_REACHED,
    );
    this.name = 'ChatbotGlobalSpendLimitReachedError';
  }
}

/** Platform-wide backstop (layer 10) — the resolved provider's prepaid balance is too low. */
export class ChatbotProviderBalanceLowError extends PlatformDomainError {
  constructor() {
    super(
      "The resolved LLM provider's balance is below the minimum threshold",
      PlatformErrorCode.CHATBOT_PROVIDER_BALANCE_LOW,
    );
    this.name = 'ChatbotProviderBalanceLowError';
  }
}

/**
 * UC-033 A4 — the LLM provider call itself failed (timeout, upstream error, malformed response).
 * Mapped to 503, distinct from the 429 cap-rejection family above. Deliberately carries a fixed,
 * generic public message — never the real upstream error text, which can include vendor-specific
 * diagnostic details (PR #360 review finding). The real cause is logged server-side by the
 * use case before this is thrown, not embedded in the public Problem Details response.
 */
export class ChatbotProviderUnavailableError extends PlatformDomainError {
  constructor() {
    super(
      'The chat assistant is temporarily unavailable',
      PlatformErrorCode.CHATBOT_PROVIDER_UNAVAILABLE,
    );
    this.name = 'ChatbotProviderUnavailableError';
  }
}

/**
 * UC-033 A3 — resolved-cap message-length enforcement (layer 5), same
 * `tenant.settings.chatbot?.X ?? DEFAULT_X` resolution as every other cap. The BFF DTO layer
 * (S09) is the primary UX-facing check; this is the real backstop so the use case is never
 * reachable with an oversized message from any caller (PR #360 review finding — a generous
 * static Zod ceiling at the backend DTO layer alone left the tenant's real, often-smaller cap
 * unenforced for any caller that reaches this endpoint directly).
 */
export class ChatbotMessageTooLongError extends PlatformDomainError {
  constructor() {
    super('Message exceeds the maximum allowed length', PlatformErrorCode.CHATBOT_MESSAGE_TOO_LONG);
    this.name = 'ChatbotMessageTooLongError';
  }
}

/** docs/14-API_CONTRACTS.md: "404 — ... sessionId doesn't belong to this tenant". */
export class ChatbotSessionNotFoundError extends PlatformDomainError {
  constructor(sessionId: string) {
    super(
      `Chatbot session '${sessionId}' not found for this tenant`,
      PlatformErrorCode.CHATBOT_SESSION_NOT_FOUND,
    );
    this.name = 'ChatbotSessionNotFoundError';
  }
}
