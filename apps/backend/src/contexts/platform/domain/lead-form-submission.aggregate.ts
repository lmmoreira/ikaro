import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { addMonthsUTC } from '../../../shared/utils/calendar-date';
import { normalizeText } from '../../../shared/utils/text-normalization';
import { Email } from '../../../shared/value-objects/email.vo';
import { PhoneNumber } from '../../../shared/value-objects/phone-number.vo';
import { LeadFormSubmissionNameRequiredError } from './errors/lead-form-domain.error';
import { LeadFormSubmissionReceived } from './events/lead-form-submission-received.event';

export type LeadFormQuestionType = 'TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';

// Full snapshot at submission time — questionLabel/questionType are never looked up live against
// LeadFormConfig's own question catalog, so a manager editing or removing a question later can
// never corrupt how an already-stored submission renders (docs/02-DOMAIN_MODEL.md § LeadFormSubmission,
// same reasoning BookingLine.priceAtBooking/serviceNameAtBooking already exists for).
export interface LeadFormAnswer {
  questionId: string;
  questionLabel: string;
  questionType: LeadFormQuestionType;
  answerValue: string | string[];
}

export interface LeadFormSubmissionProps {
  id: string;
  tenantId: string;
  customerId: string | null;
  name: string;
  email: Email;
  phone: PhoneNumber;
  answers: LeadFormAnswer[];
  submittedAt: Date;
  expiresAt: Date;
  ipAddress: string;
}

export interface CreateLeadFormSubmissionParams {
  tenantId: string;
  customerId: string | null;
  name: string;
  email: string;
  phone: string;
  answers: LeadFormAnswer[];
  ipAddress: string;
  /** The tenant's *current* retentionMonths (docs/21-TENANTS_SETTINGS_SCHEMA.md §8), resolved by
   * the caller. Read once, here, to compute expiresAt — never recomputed later even if the
   * tenant's setting later changes ("settings changes apply to future only"). */
  retentionMonths: number;
  correlationId: string;
}

export class LeadFormSubmission extends AggregateRoot {
  private readonly props: LeadFormSubmissionProps;

  private constructor(props: LeadFormSubmissionProps) {
    super();
    // Deep-clone `answers` here (not just the outer array) so `this.props` is never aliased to
    // caller-owned objects — a shallow `[...answers]` copy still shares each element's own
    // object/array references, so a caller mutating an answer's `answerValue` (a string OR a
    // string[] for MULTIPLE_CHOICE) after create()/reconstitute() would otherwise corrupt the
    // aggregate's own "full snapshot" invariant (PR #417 review finding, M20-S02;
    // docs/02-DOMAIN_MODEL.md § LeadFormSubmission). Covers both create() and reconstitute()
    // uniformly since both funnel through this constructor. Same pattern TenantSettings'
    // businessHours getter already uses (structuredClone) for a nested mutable prop.
    this.props = { ...props, answers: structuredClone(props.answers) };
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get customerId(): string | null {
    return this.props.customerId;
  }
  get name(): string {
    return this.props.name;
  }
  get email(): Email {
    return this.props.email;
  }
  get phone(): PhoneNumber {
    return this.props.phone;
  }
  get answers(): LeadFormAnswer[] {
    // Fresh deep clone on every access — a caller mutating a previously returned answer must
    // never corrupt the aggregate's own stored state or a later read (PR #417 review finding).
    return structuredClone(this.props.answers);
  }
  get submittedAt(): Date {
    return this.props.submittedAt;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get ipAddress(): string {
    return this.props.ipAddress;
  }

  static create(params: CreateLeadFormSubmissionParams): LeadFormSubmission {
    const {
      tenantId,
      customerId,
      name,
      email,
      phone,
      answers,
      ipAddress,
      retentionMonths,
      correlationId,
    } = params;

    const normalizedName = normalizeText(name);
    if (!normalizedName) throw new LeadFormSubmissionNameRequiredError();

    const emailVo = Email.create(email);
    const phoneVo = PhoneNumber.create(phone);

    const submittedAt = new Date();
    const expiresAt = addMonthsUTC(submittedAt, retentionMonths);
    const id = uuidv7();

    const submission = new LeadFormSubmission({
      id,
      tenantId,
      customerId,
      name: normalizedName,
      email: emailVo,
      phone: phoneVo,
      answers,
      submittedAt,
      expiresAt,
      ipAddress,
    });

    submission.addDomainEvent(
      new LeadFormSubmissionReceived(tenantId, correlationId, {
        submissionId: submission.id,
        customerId,
      }),
    );

    return submission;
  }

  static reconstitute(props: LeadFormSubmissionProps): LeadFormSubmission {
    return new LeadFormSubmission(props);
  }
}
