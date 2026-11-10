'use client';

import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { NumberInput } from '@/shared/components/ui/number-input';
import { Label } from '@/shared/components/ui/label';
import { Radio } from '@/shared/components/ui/radio';
import { Textarea } from '@/shared/components/ui/textarea';
import { useTranslations } from 'next-intl';
import type { ServiceIntakeQuestionItem, ServiceIntakeSchemaVersion } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import {
  newAttendeeDraft,
  type AttendeeDraft,
  type IntakeAnswersValue,
} from '@/features/booking/model/intake-answers';
import { NewBookingStepLayout } from './NewBookingStepLayout';
import { LEGEND_CLASS } from './new-booking-styles';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';

interface NewBookingIntakeStepProps {
  readonly schema: ServiceIntakeSchemaVersion;
  readonly value: IntakeAnswersValue;
  readonly onChange: (value: IntakeAnswersValue) => void;
  /** Catalogue message of a server-side BOOKING_INTAKE_ANSWER_MISSING rejection. */
  readonly serverError: string | null;
  readonly summary: React.ReactNode;
  readonly onBack: () => void;
  readonly onNext: () => void;
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  readonly question: ServiceIntakeQuestionItem;
  readonly value: string | boolean | undefined;
  readonly onChange: (value: string | boolean) => void;
}): React.JSX.Element {
  const t = useTranslations('booking.intake');
  const id = `intake-q-${question.fieldKey}`;

  if (question.type === 'BOOLEAN' && question.required) {
    return (
      <fieldset
        role="radiogroup"
        data-testid="intake-field-bool"
        data-field-key={question.fieldKey}
      >
        <legend className={LEGEND_CLASS}>{question.label}</legend>
        {([true, false] as const).map((answer) => (
          <label key={String(answer)} className="mr-5 inline-flex items-center gap-1.5 text-sm">
            <Radio
              name={`intake-${question.fieldKey}`}
              data-testid="intake-bool-option"
              data-answer={String(answer)}
              checked={value === answer}
              onChange={() => onChange(answer)}
            />
            {answer ? t('yes') : t('no')}
          </label>
        ))}
      </fieldset>
    );
  }
  if (question.type === 'BOOLEAN') {
    return (
      <label className="flex items-start gap-2.5 text-sm text-gray-900">
        <Checkbox
          data-testid="intake-bool-checkbox"
          data-field-key={question.fieldKey}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{question.label}</span>
      </label>
    );
  }
  return (
    <div>
      <Label htmlFor={id}>
        {question.label} {!question.required && <span>{t('optional')}</span>}
      </Label>
      <Textarea
        id={id}
        rows={2}
        data-testid="intake-input"
        data-field-key={question.fieldKey}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function AttendeesList({
  attendees,
  onChange,
}: {
  readonly attendees: readonly AttendeeDraft[];
  readonly onChange: (attendees: AttendeeDraft[]) => void;
}): React.JSX.Element {
  const t = useTranslations('booking.intake');
  const update = (index: number, patch: Partial<AttendeeDraft>) =>
    onChange(attendees.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <fieldset className="space-y-2" data-testid="intake-attendees">
      <legend className={LEGEND_CLASS}>{t('attendeesLegend')}</legend>
      {attendees.map((row, index) => (
        <div key={row.id} className="flex items-center gap-2">
          <Input
            data-testid="intake-attendee-name"
            maxLength={255}
            aria-label={t('attendeeNameLabel', { index: index + 1 })}
            placeholder={t('attendeeNamePlaceholder')}
            value={row.name}
            onChange={(event) => update(index, { name: event.target.value })}
          />
          <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
            <Checkbox
              checked={row.isMinor}
              onChange={(event) => update(index, { isMinor: event.target.checked })}
            />
            {t('attendeeMinor')}
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t('attendeeRemoveLabel', { index: index + 1 })}
            onClick={() => onChange(attendees.filter((_, i) => i !== index))}
          >
            {t('attendeeRemove')}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="intake-add-attendee"
        onClick={() => onChange([...attendees, newAttendeeDraft()])}
      >
        {t('addAttendee')}
      </Button>
    </fieldset>
  );
}

// The intake for staff: the same questions, count and attendees the schema defines, but nothing is
// required (UC-108 A7) — staff continue with whatever the customer told them, the consent is a
// tick they may leave off, and a form left blank stores nothing. The hotsite's validation is not
// applied here.
export function NewBookingIntakeStep({
  schema,
  value,
  onChange,
  serverError,
  summary,
  onBack,
  onNext,
}: NewBookingIntakeStepProps): React.JSX.Element {
  const t = useTranslations('booking.intake');
  const tn = useTranslations('dashboard.newBooking.steps');
  const tUnits = useTranslations('common.units');

  return (
    <NewBookingStepLayout summary={summary} onBack={onBack} onNext={onNext}>
      <div data-testid="step-intake">
        <h2 className="text-xl font-bold text-gray-900">{t('heading')}</h2>
        <p className="mt-1 text-sm text-gray-600">{tn('intakeOptional')}</p>
      </div>

      {serverError && <FeedbackMessage focusOnMount title={serverError} />}

      {schema.questions.map((question) => (
        <QuestionField
          key={question.fieldKey}
          question={question}
          value={value.answers[question.fieldKey]}
          onChange={(answer) =>
            onChange({ ...value, answers: { ...value.answers, [question.fieldKey]: answer } })
          }
        />
      ))}

      {schema.participantCountRequired && (
        <div>
          <Label htmlFor="intake-participants">{t('participantsLabel')}</Label>
          <NumberInput
            id="intake-participants"
            unit={tUnits('people')}
            min={1}
            data-testid="intake-participants"
            wrapperClassName="w-40"
            value={value.participantCount}
            onChange={(event) => onChange({ ...value, participantCount: event.target.value })}
          />
        </div>
      )}

      {schema.requiresNamedAttendees && (
        <AttendeesList
          attendees={value.attendees}
          onChange={(attendees) => onChange({ ...value, attendees })}
        />
      )}

      <label className="flex items-start gap-2.5 text-sm text-gray-900">
        <Checkbox
          data-testid="intake-consent"
          checked={value.consentAccepted}
          onChange={(event) => onChange({ ...value, consentAccepted: event.target.checked })}
        />
        <span>{schema.consentText}</span>
      </label>
    </NewBookingStepLayout>
  );
}
