import { HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { mapSharedAddressError } from '../../../../shared/http/address-validation-error.mapper';
import { mapSharedVoError } from '../../../../shared/http/vo-validation-error.mapper';
import {
  HotsiteConfigConcurrentModificationError,
  HotsiteNotFoundError,
  HotsiteTemplateNotFoundError,
  LeadFormConfigConcurrentModificationError,
  PlatformDomainError,
  SlugAlreadyTakenError,
  SlugReservedError,
  TenantInactiveError,
  TenantNotFoundError,
  TenantTimezoneImmutableError,
} from '../../domain/errors/platform-domain.error';
import {
  SignupSlugInvalidError,
  SignupSlugTakenError,
  SignupTurnstileFailedError,
} from '../../domain/errors/signup-domain.error';
import {
  ChatbotConcurrencyCapReachedError,
  ChatbotDailyCapReachedError,
  ChatbotGlobalSpendLimitReachedError,
  ChatbotMessageCapReachedError,
  ChatbotProviderBalanceLowError,
  ChatbotProviderUnavailableError,
  ChatbotSessionNotFoundError,
} from '../../domain/errors/chatbot-domain.error';
import {
  LeadFormAnswerQuestionInvalidError,
  LeadFormAnswerRequiredError,
  LeadFormCustomerOnlyError,
  LeadFormDailyCapReachedError,
  LeadFormNotEnabledError,
  LeadFormQuestionLabelRequiredError,
  LeadFormSubmissionNotFoundError,
} from '../../domain/errors/lead-form-domain.error';

// M20-S05 — split out of mapPlatformError to stay under the 40-line function cap. Returns
// without throwing when `err` isn't a lead-form-specific error, so the caller falls through to
// its own generic branches. LeadFormDailyCapReachedError (M20-S02) joins the Chatbot 429 family
// below rather than living here — this is its first HTTP consumer (S02 shipped with no HTTP
// surface at all), and grouping it with the existing cap-rejection bucket keeps that one bucket
// as the single source of truth for "come back tomorrow" responses.
function mapLeadFormError(err: unknown): void {
  if (err instanceof LeadFormNotEnabledError) {
    throw throwProblemDetail(HttpStatus.NOT_FOUND, err.code, err.message, err.field);
  }
  // audienceMode === 'CUSTOMER_ONLY' with no authenticated customer identity (UC-040 A1).
  // Reuses the existing AuthErrorCode.UNAUTHORIZED, not a new platform error code.
  if (err instanceof LeadFormCustomerOnlyError) {
    throw throwProblemDetail(HttpStatus.UNAUTHORIZED, err.code, err.message);
  }
  if (
    err instanceof LeadFormQuestionLabelRequiredError ||
    err instanceof LeadFormAnswerQuestionInvalidError ||
    err instanceof LeadFormAnswerRequiredError
  ) {
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message, err.field);
  }
}

// Every slug rule the Platform policy owns, in one place. A reserved word is `422`
// `SIGNUP_SLUG_RESERVED` on every path; a taken slug keeps the operator route's documented `409`
// `PLATFORM_SLUG_ALREADY_TAKEN` (UC-024 A2); the format `400` comes from the Slug VO's own mapper.
// Returns without throwing for any other error.
function mapSlugError(err: unknown): void {
  mapSignupError(err);
  if (err instanceof SlugReservedError) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message, err.field);
  }
  if (err instanceof SlugAlreadyTakenError) {
    throw throwProblemDetail(HttpStatus.CONFLICT, err.code, err.message, err.field);
  }
}

// The public signup answers (M26-S24, UC-127): a taken slug is `409`, an invalid one `422`, a
// failed Turnstile `400`. Returns without throwing for any other error.
function mapSignupError(err: unknown): void {
  if (err instanceof SignupSlugTakenError) {
    throw throwProblemDetail(HttpStatus.CONFLICT, err.code, err.message, err.field);
  }
  if (err instanceof SignupSlugInvalidError) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message, err.field);
  }
  if (err instanceof SignupTurnstileFailedError) {
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message);
  }
}

// Every rule the Platform tenant policy refuses with a `422`: the slug rules above, and a change of
// the business timezone, which is set at signup and never edited (TD61). `422`, not the `409` of an
// inactive tenant: the request is well formed and the rule refuses it. Returns without throwing for
// any other error.
function mapTenantRuleError(err: unknown): void {
  mapSlugError(err);
  if (err instanceof TenantTimezoneImmutableError) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message, err.field);
  }
}

export function mapPlatformError(err: unknown): never {
  mapSharedAddressError(err);
  mapSharedVoError(err);
  mapLeadFormError(err);
  mapTenantRuleError(err);
  if (
    err instanceof TenantInactiveError ||
    err instanceof HotsiteConfigConcurrentModificationError ||
    err instanceof LeadFormConfigConcurrentModificationError
  ) {
    throw throwProblemDetail(HttpStatus.CONFLICT, err.code, err.message, err.field);
  }
  if (
    err instanceof TenantNotFoundError ||
    err instanceof HotsiteNotFoundError ||
    err instanceof HotsiteTemplateNotFoundError ||
    err instanceof ChatbotSessionNotFoundError ||
    err instanceof LeadFormSubmissionNotFoundError
  ) {
    throw throwProblemDetail(HttpStatus.NOT_FOUND, err.code, err.message, err.field);
  }
  // Chatbot cap-rejection family (docs/USE_CASES.md UC-033) — all map to 429,
  // including the 2 platform-wide backstops (M19-S05 story-discovery, 2026-08-12).
  if (
    err instanceof ChatbotDailyCapReachedError ||
    err instanceof ChatbotConcurrencyCapReachedError ||
    err instanceof ChatbotMessageCapReachedError ||
    err instanceof ChatbotGlobalSpendLimitReachedError ||
    err instanceof ChatbotProviderBalanceLowError ||
    err instanceof LeadFormDailyCapReachedError
  ) {
    throw throwProblemDetail(HttpStatus.TOO_MANY_REQUESTS, err.code, err.message, err.field);
  }
  if (err instanceof ChatbotProviderUnavailableError) {
    throw throwProblemDetail(HttpStatus.SERVICE_UNAVAILABLE, err.code, err.message, err.field);
  }
  if (err instanceof PlatformDomainError) {
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message, err.field);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
