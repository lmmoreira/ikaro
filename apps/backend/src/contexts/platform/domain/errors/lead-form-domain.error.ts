import { GenericErrorCode, PlatformErrorCode } from '@ikaro/types/protocol/errors';
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
