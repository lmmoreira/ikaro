import { GenericErrorCode, PlatformErrorCode } from '@ikaro/types/protocol/errors';
import { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';
import { PlatformDomainError } from './platform-domain.error';

/**
 * `name` has no dedicated VO (unlike `email`/`phone`, which reuse `Email`/`PhoneNumber`'s own
 * codes) — a plain required-string rule with no VO behind it reuses the small closed
 * `GenericErrorCode` set instead of minting a new `PlatformErrorCode` for it
 * (docs/ENGINEERING_RULES.md § Single source of truth for a validation rule's code). Implements
 * `DomainErrorShape` directly rather than extending `PlatformDomainError`, since that base types
 * `code` to `PlatformErrorCode` only.
 */
export class LeadFormSubmissionNameRequiredError extends Error implements DomainErrorShape {
  readonly code: GenericErrorCode;
  readonly field = 'name';

  constructor() {
    super('name must not be empty');
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'LeadFormSubmissionNameRequiredError';
    this.code = GenericErrorCode.FIELD_REQUIRED;
  }
}

/**
 * Covers both the tenant-wide daily cap and the per-IP daily cap — one error for either layer,
 * matching `ChatbotDailyCapReachedError`'s own "come back tomorrow" grouping
 * (chatbot-session-resolution.helpers.ts's `checkNewSessionVolumeCaps`).
 */
export class LeadFormDailyCapReachedError extends PlatformDomainError {
  constructor() {
    super(
      "Tenant's daily lead-form submission cap has been reached",
      PlatformErrorCode.LEAD_FORM_DAILY_CAP_REACHED,
    );
    this.name = 'LeadFormDailyCapReachedError';
  }
}
