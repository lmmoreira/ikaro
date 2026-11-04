'use client';

import { useState } from 'react';
import type React from 'react';
import { useTranslations } from 'next-intl';
import type { ServiceIntakeSchemaVersion } from '@ikaro/types';
import { BrandedFeedbackMessage } from '@/shared/components/hotsite/branded-feedback-message';
import { validateIntake, type IntakeAnswersValue } from '@/features/booking/model/intake-answers';
import { IntakeAttendeesList } from './IntakeAttendeesList';
import { IntakeFieldMessage, IntakeQuestionField, intakeInputClass } from './IntakeQuestionField';

interface IntakeAnswersStepProps {
  readonly schema: ServiceIntakeSchemaVersion;
  readonly value: IntakeAnswersValue;
  readonly onChange: (value: IntakeAnswersValue) => void;
  /** Catalogue message of a server-side BOOKING_INTAKE_ANSWER_MISSING rejection (summary only). */
  readonly serverError: string | null;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

const fieldBorder = (hasError: boolean): React.CSSProperties => ({
  borderRadius: 'var(--ba-radius)',
  ...(hasError ? {} : { borderColor: 'var(--ba-secondary)' }),
  backgroundColor: 'var(--ba-secondary)',
  color: 'var(--ba-text)',
});

// Schema-driven, never hard-coded. Validates against the displayed version only; the step never
// submits — the POST stays on Confirmation. Field errors come from client validation; a
// server-side rejection carries no field names, so it shows the summary banner alone.
export function IntakeAnswersStep({
  schema,
  value,
  onChange,
  serverError,
  onNext,
  onBack,
}: IntakeAnswersStepProps): React.JSX.Element {
  const t = useTranslations('booking.intake');
  const tc = useTranslations('common');
  const [attempts, setAttempts] = useState(0);
  const validation = validateIntake(schema, value);
  const showFieldErrors = attempts > 0;
  const summary =
    showFieldErrors && validation.count > 0
      ? t('summaryFields', { count: validation.count })
      : serverError;

  function handleNext() {
    if (validation.count > 0) {
      setAttempts((n) => n + 1);
      return;
    }
    onNext();
  }

  return (
    <div data-testid="step-intake">
      <h2 className="text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
        {t('heading')}
      </h2>
      <p className="mt-1 mb-4 text-sm opacity-70">
        {t('description', { version: schema.version })}
      </p>

      {schema.questions.map((question) => (
        <IntakeQuestionField
          key={question.fieldKey}
          question={question}
          value={value.answers[question.fieldKey]}
          hasError={showFieldErrors && validation.missingQuestions.includes(question.fieldKey)}
          onChange={(answer) =>
            onChange({ ...value, answers: { ...value.answers, [question.fieldKey]: answer } })
          }
        />
      ))}

      {schema.participantCountRequired && (
        <div className="mb-4">
          <label
            htmlFor="intake-participants"
            className="mb-1 block text-sm font-medium"
            style={{ color: 'var(--ba-text)' }}
          >
            {t('participantsLabel')} <span aria-hidden="true">*</span>
          </label>
          <input
            id="intake-participants"
            data-testid="intake-participants"
            type="number"
            min={1}
            className={intakeInputClass(
              'w-32 border px-3 py-2',
              showFieldErrors && validation.participants,
            )}
            style={fieldBorder(showFieldErrors && validation.participants)}
            value={value.participantCount}
            onChange={(e) => onChange({ ...value, participantCount: e.target.value })}
            aria-invalid={showFieldErrors && validation.participants ? true : undefined}
          />
          {showFieldErrors && validation.participants && (
            <IntakeFieldMessage
              id="intake-participants-error"
              testId="intake-field-error-participants"
            >
              {t('participantsError')}
            </IntakeFieldMessage>
          )}
        </div>
      )}

      {schema.requiresNamedAttendees && (
        <IntakeAttendeesList
          attendees={value.attendees}
          hasError={showFieldErrors && validation.attendees}
          onChange={(attendees) => onChange({ ...value, attendees })}
        />
      )}

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          required
          aria-invalid={showFieldErrors && validation.consent ? true : undefined}
          aria-describedby={
            showFieldErrors && validation.consent ? 'intake-consent-error' : undefined
          }
          data-testid="intake-consent"
          checked={value.consentAccepted}
          onChange={(e) => onChange({ ...value, consentAccepted: e.target.checked })}
        />
        <span>{schema.consentText}</span>
      </label>
      {showFieldErrors && validation.consent && (
        <IntakeFieldMessage
          id="intake-consent-error"
          testId="intake-consent-error"
          className="ml-7"
        >
          {t('consentError')}
        </IntakeFieldMessage>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer border px-6 py-3"
          style={{
            borderRadius: 'var(--ba-radius)',
            borderColor: 'var(--ba-secondary)',
            color: 'var(--ba-text)',
          }}
        >
          {tc('back')}
        </button>
        <button
          type="button"
          onClick={handleNext}
          data-testid="step-next"
          style={btnStyle}
          className="cursor-pointer border-2 px-8 py-3 font-semibold transition-all hover:opacity-90"
        >
          {tc('next')}
        </button>
      </div>

      {summary && (
        <div className="mt-4">
          <BrandedFeedbackMessage
            key={attempts}
            focusOnMount
            testId="intake-error-summary"
            title={t('summaryTitle')}
          >
            {summary}
          </BrandedFeedbackMessage>
        </div>
      )}
    </div>
  );
}
