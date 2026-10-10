import { Inject, Injectable } from '@nestjs/common';
import { BookingAttendeeInput } from '../../domain/booking-attendee.entity';
import { BookingIntakeSnapshot } from '../../domain/booking.types';
import { BookingIntakeAnswerMissingError } from '../../domain/errors/booking-domain.error';
import { ServiceBookingIntakeSchema } from '../../domain/service-booking-intake-schema';
import {
  IServiceIntakeSchemaRepository,
  SERVICE_INTAKE_SCHEMA_REPOSITORY,
} from '../ports/service-intake-schema-repository.port';

export interface IntakeSubmissionInput {
  intakeSchemaVersion?: number;
  intakeAnswers?: Record<string, string | boolean>;
  consentAccepted?: boolean;
  participantCount?: number;
  attendees?: BookingAttendeeInput[];
}

export interface ResolvedIntake {
  intake: BookingIntakeSnapshot | null;
  attendeeInputs: BookingAttendeeInput[];
}

const NO_INTAKE: ResolvedIntake = { intake: null, attendeeInputs: [] };

export interface ResolveIntakeOptions {
  // A staff member booking on a customer's behalf (UC-108) may skip the intake: no required
  // answer, no participant count and no consent is demanded, and whatever they do enter is stored.
  // Customers never pass this.
  intakeOptional?: boolean;
}

// UC-068 — validates a booking request's intake submission against the target service's
// currently-active (or an explicitly-displayed prior, UC-068 A1) intake schema, and builds the
// immutable snapshot Booking.requestBooking() stores. A service with no active schema silently
// ignores any intake fields sent (UC-068 A5) rather than erroring — the precondition never
// applied, so there is nothing to validate against.
@Injectable()
export class BookingIntakeValidationService {
  constructor(
    @Inject(SERVICE_INTAKE_SCHEMA_REPOSITORY)
    private readonly intakeSchemaRepo: IServiceIntakeSchemaRepository,
  ) {}

  async resolve(
    serviceId: string,
    tenantId: string,
    input: IntakeSubmissionInput,
    options: ResolveIntakeOptions = {},
  ): Promise<ResolvedIntake> {
    const activeSchema = await this.intakeSchemaRepo.findActiveByServiceId(serviceId, tenantId);
    if (!activeSchema) return NO_INTAKE;

    // The version is checked before deciding whether anything was submitted, so a version that
    // never existed is refused even when it is the only thing staff sent.
    const schema = await this.resolveSchemaVersion(
      serviceId,
      tenantId,
      activeSchema,
      input.intakeSchemaVersion,
    );
    if (options.intakeOptional && !hasIntakeSubmission(input)) return NO_INTAKE;

    this.validateAnswers(
      schema,
      input.intakeAnswers ?? {},
      input.participantCount,
      options.intakeOptional,
    );
    if (!input.consentAccepted && !options.intakeOptional) {
      throw new BookingIntakeAnswerMissingError(['consentAccepted']);
    }

    return {
      intake: {
        intakeSchemaVersion: schema.version,
        intakeAnswers: input.intakeAnswers ?? {},
        consentAcceptedAt: input.consentAccepted ? new Date() : null,
        consentVersion: input.consentAccepted ? schema.consentVersion : null,
      },
      attendeeInputs: schema.requiresNamedAttendees ? (input.attendees ?? []) : [],
    };
  }

  // "Matches the currently-active one *or* an explicitly-passed prior version the client
  // displayed (never reject solely for 'not the latest')" — UC-068 A1. A requestedVersion that
  // matches no version this service ever published is an adversarial-only edge case (a real
  // client only ever echoes back a version it actually fetched) — reused generically as a
  // "missing" intakeSchemaVersion rather than a dedicated error code (M23-S02 story-discovery).
  private async resolveSchemaVersion(
    serviceId: string,
    tenantId: string,
    activeSchema: ServiceBookingIntakeSchema,
    requestedVersion: number | undefined,
  ): Promise<ServiceBookingIntakeSchema> {
    if (requestedVersion === undefined || requestedVersion === activeSchema.version) {
      return activeSchema;
    }
    const allVersions = await this.intakeSchemaRepo.findAllByServiceId(serviceId, tenantId);
    const match = allVersions.find((v) => v.version === requestedVersion);
    if (!match) throw new BookingIntakeAnswerMissingError(['intakeSchemaVersion']);
    return match;
  }

  // Checks presence (required questions) and, for any answer actually submitted (required or
  // optional), that its value matches the question's declared type (FREE_TEXT -> string,
  // BOOLEAN -> boolean) — a mismatched type is never silently coerced or accepted. A
  // whitespace-only string (e.g. "   ") counts as missing, not a valid FREE_TEXT answer — it
  // must never reach the immutable intakeAnswers snapshot.
  private validateAnswers(
    schema: ServiceBookingIntakeSchema,
    answers: Record<string, string | boolean>,
    participantCount: number | undefined,
    intakeOptional = false,
  ): void {
    const invalid: string[] = [];
    for (const question of schema.questions) {
      const value = answers[question.fieldKey];
      const isMissing = value === undefined || (typeof value === 'string' && value.trim() === '');
      if (isMissing) {
        if (question.required && !intakeOptional) invalid.push(question.fieldKey);
        continue;
      }
      const isCorrectType =
        question.type === 'BOOLEAN' ? typeof value === 'boolean' : typeof value === 'string';
      if (!isCorrectType) invalid.push(question.fieldKey);
    }
    if (schema.participantCountRequired && participantCount === undefined && !intakeOptional) {
      invalid.push('participantCount');
    }
    if (invalid.length) throw new BookingIntakeAnswerMissingError(invalid);
  }
}

// Whether the request carries anything at all for the intake: an answer, the consent, attendees or
// a participant count. Used to tell "staff skipped the intake" from "staff entered part of it".
function hasIntakeSubmission(input: IntakeSubmissionInput): boolean {
  return (
    Object.keys(input.intakeAnswers ?? {}).length > 0 ||
    input.consentAccepted === true ||
    (input.attendees?.length ?? 0) > 0 ||
    input.participantCount !== undefined
  );
}
