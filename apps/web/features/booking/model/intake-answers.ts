import type {
  BookingAttendeeInput,
  BookingFlowRequestFields,
  BookingIntakeAnswers,
  ServiceIntakeSchemaVersion,
} from '@ikaro/types';

export interface AttendeeDraft {
  id: string;
  name: string;
  isMinor: boolean;
}

export interface IntakeAnswersValue {
  answers: BookingIntakeAnswers;
  participantCount: string;
  attendees: AttendeeDraft[];
  consentAccepted: boolean;
}

export interface IntakeValidation {
  readonly missingQuestions: readonly string[];
  readonly participants: boolean;
  readonly attendees: boolean;
  readonly consent: boolean;
  readonly count: number;
}

export function emptyIntakeAnswers(): IntakeAnswersValue {
  return { answers: {}, participantCount: '', attendees: [], consentAccepted: false };
}

function isQuestionMissing(
  question: ServiceIntakeSchemaVersion['questions'][number],
  value: IntakeAnswersValue,
): boolean {
  if (!question.required) return false;
  const answer = value.answers[question.fieldKey];
  if (question.type === 'BOOLEAN') return typeof answer !== 'boolean';
  return typeof answer !== 'string' || answer.trim() === '';
}

function parseParticipantCount(raw: string): number | null {
  const parsed = Number(raw.trim());
  return raw.trim() !== '' && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Validates against the displayed schema version only — never a newer one. */
export function validateIntake(
  schema: ServiceIntakeSchemaVersion,
  value: IntakeAnswersValue,
): IntakeValidation {
  const missingQuestions = schema.questions
    .filter((question) => isQuestionMissing(question, value))
    .map((question) => question.fieldKey);
  const participants =
    schema.participantCountRequired && parseParticipantCount(value.participantCount) === null;
  const attendees =
    schema.requiresNamedAttendees && value.attendees.some((row) => row.name.trim() === '');
  const consent = !value.consentAccepted;
  const count =
    missingQuestions.length + Number(participants) + Number(attendees) + Number(consent);
  return { missingQuestions, participants, attendees, consent, count };
}

function buildAnswers(
  schema: ServiceIntakeSchemaVersion,
  value: IntakeAnswersValue,
): BookingIntakeAnswers {
  const answers: BookingIntakeAnswers = {};
  for (const question of schema.questions) {
    const answer = value.answers[question.fieldKey];
    if (question.type === 'BOOLEAN' && typeof answer === 'boolean') {
      answers[question.fieldKey] = answer;
    } else if (
      question.type === 'FREE_TEXT' &&
      typeof answer === 'string' &&
      answer.trim() !== ''
    ) {
      answers[question.fieldKey] = answer.trim();
    }
  }
  return answers;
}

function buildAttendees(value: IntakeAnswersValue): BookingAttendeeInput[] {
  return value.attendees
    .filter((row) => row.name.trim() !== '')
    .map((row) => ({ name: row.name.trim(), isMinor: row.isMinor }));
}

export function buildIntakeRequestFields(
  schema: ServiceIntakeSchemaVersion,
  value: IntakeAnswersValue,
): BookingFlowRequestFields {
  const participantCount = schema.participantCountRequired
    ? parseParticipantCount(value.participantCount)
    : null;
  const attendees = schema.requiresNamedAttendees ? buildAttendees(value) : [];
  return {
    intakeSchemaVersion: schema.version,
    intakeAnswers: buildAnswers(schema, value),
    consentAccepted: true,
    ...(participantCount === null ? {} : { participantCount }),
    ...(attendees.length > 0 ? { attendees } : {}),
  };
}
