import { AuthErrorCode, GenericErrorCode, PlatformErrorCode } from '@ikaro/types/protocol/errors';
import { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';
import { PlatformDomainError } from './platform-domain.error';

/** UC-037 A1 — LeadFormConfig.updateQuestions() rejects more than 20 entries. */
export class LeadFormQuestionLimitReachedError extends PlatformDomainError {
  constructor() {
    super(
      'A lead form can have at most 20 questions',
      PlatformErrorCode.LEAD_FORM_QUESTION_LIMIT_REACHED,
    );
    this.name = 'LeadFormQuestionLimitReachedError';
  }
}

/** UC-037 A2 — a SINGLE_CHOICE/MULTIPLE_CHOICE question with fewer than 2 or more than 10 options. */
export class LeadFormQuestionOptionsInvalidError extends PlatformDomainError {
  constructor(questionIndex: number) {
    super(
      `Question ${questionIndex} must have between 2 and 10 options`,
      PlatformErrorCode.LEAD_FORM_QUESTION_OPTIONS_INVALID,
      `questions[${questionIndex}].options`,
    );
    this.name = 'LeadFormQuestionOptionsInvalidError';
  }
}

/**
 * Two questions sharing the same `id` within one save — the frontend assigns each new question's
 * `id` client-side (no per-question backend round-trip while editing; the id itself has no
 * security/lookup significance, docs/13-DATABASE_SCHEMA.md's lead_form_answers.question_id is
 * "informational; matching is by question_label, not this"), so this is a defensive integrity
 * check against a frontend bug, not a security boundary.
 */
export class LeadFormQuestionDuplicateIdError extends PlatformDomainError {
  constructor(id: string) {
    super(`Duplicate question id: ${id}`, PlatformErrorCode.LEAD_FORM_QUESTION_DUPLICATE_ID);
    this.name = 'LeadFormQuestionDuplicateIdError';
  }
}

/**
 * UC-037 A3 — an empty question label. Deliberately does NOT extend PlatformDomainError: its
 * `code` belongs to the shared GenericErrorCode namespace (no VO backs a plain non-empty-string
 * rule), not PlatformErrorCode — forcing a fake platform-origin code would misrepresent the type
 * (docs/ENGINEERING_RULES.md § Single source of truth for a validation rule's code; mirrors
 * BookingAddressValidationError's identical reasoning for AddressErrorCode/CountryCodeErrorCode).
 */
export class LeadFormQuestionLabelRequiredError extends Error implements DomainErrorShape {
  readonly code: GenericErrorCode;
  readonly field: string;

  constructor(questionIndex: number) {
    super(`Question ${questionIndex} label is required`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'LeadFormQuestionLabelRequiredError';
    this.code = GenericErrorCode.FIELD_REQUIRED;
    this.field = `questions[${questionIndex}].label`;
  }
}

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

/**
 * M20-S05 — the public GET/POST lead-form endpoints throw this when the `LEAD_FORM` module has
 * no `HotsiteConfig.layout[]` entry yet, or has one with `enabled: false`. Mapped to 404
 * (docs/14-API_CONTRACTS.md § Lead Form Widget). Deliberately takes no `tenantId` param — unlike
 * `TenantNotFoundError`/`HotsiteNotFoundError`, this error is reachable from a fully anonymous
 * public caller, and `mapPlatformError` forwards `err.message` to the response body verbatim, so
 * nothing internal-only belongs in it (PR #423 review, CodeRabbit: don't leak tenant UUIDs).
 */
export class LeadFormNotEnabledError extends PlatformDomainError {
  constructor() {
    super('Lead form is not available', PlatformErrorCode.LEAD_FORM_NOT_ENABLED);
    this.name = 'LeadFormNotEnabledError';
  }
}

/**
 * M20-S05 — `audienceMode === 'CUSTOMER_ONLY'` and the submission carries no authenticated
 * customer identity (UC-040 A1). Deliberately does NOT extend `PlatformDomainError` (whose `code`
 * is typed `PlatformErrorCode` only) — this reuses the *existing* `AuthErrorCode.UNAUTHORIZED`
 * (the same code `JwtAuthGuard` already throws elsewhere) rather than minting a new platform
 * error code for what is, semantically, an auth-boundary condition, not a business rule.
 */
export class LeadFormCustomerOnlyError extends Error implements DomainErrorShape {
  readonly code: AuthErrorCode;

  constructor() {
    super('This form requires a logged-in customer');
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'LeadFormCustomerOnlyError';
    this.code = AuthErrorCode.UNAUTHORIZED;
  }
}

/**
 * M20-S05 — a submitted answer's `questionId` doesn't match any question in the tenant's current
 * `LeadFormConfig.questions` catalog (e.g. a stale client cache after a manager edit). Rejects
 * the whole submission rather than silently dropping the answer — decided during story-discovery,
 * 2026-08-25. No dedicated VO backs this rule, so it reuses the closed `GenericErrorCode` set
 * (docs/ENGINEERING_RULES.md § Single source of truth for a validation rule's code).
 */
export class LeadFormAnswerQuestionInvalidError extends Error implements DomainErrorShape {
  readonly code: GenericErrorCode;
  readonly field: string;

  constructor(answerIndex: number) {
    super(`Answer ${answerIndex} references an unknown question`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'LeadFormAnswerQuestionInvalidError';
    this.code = GenericErrorCode.VALUE_INVALID;
    this.field = `answers[${answerIndex}].questionId`;
  }
}

/**
 * M20-S05 — a question marked `required: true` in the tenant's current catalog has no matching,
 * non-empty answer in the submission. Identified by the catalog's own question `id`, not an
 * `answers[]` array index — a missing required answer has no position in that array to point to
 * (unlike `LeadFormAnswerQuestionInvalidError`, which references a real submitted element). Same
 * `GENERIC_FIELD_REQUIRED` code `LeadFormQuestionLabelRequiredError`/
 * `LeadFormSubmissionNameRequiredError` already use for a plain required-value rule with no VO
 * behind it.
 */
export class LeadFormAnswerRequiredError extends Error implements DomainErrorShape {
  readonly code: GenericErrorCode;
  readonly field: string;

  constructor(questionId: string) {
    super(`Question '${questionId}' requires an answer`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'LeadFormAnswerRequiredError';
    this.code = GenericErrorCode.FIELD_REQUIRED;
    this.field = `answers.${questionId}`;
  }
}

/**
 * M20-S06 — `GET .../submissions/:id` when the id doesn't exist or belongs to a different
 * tenant. Deliberately takes no distinguishing message detail beyond the id (mirrors
 * `ChatbotSessionNotFoundError`'s own "not found for this tenant" shape) — the "404, not 403"
 * cross-tenant-probing convention `GetBookingByIdUseCase` already establishes.
 */
export class LeadFormSubmissionNotFoundError extends PlatformDomainError {
  constructor(submissionId: string) {
    super(
      `Lead form submission '${submissionId}' not found for this tenant`,
      PlatformErrorCode.LEAD_FORM_SUBMISSION_NOT_FOUND,
    );
    this.name = 'LeadFormSubmissionNotFoundError';
  }
}
