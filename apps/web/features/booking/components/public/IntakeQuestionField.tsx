'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type { ServiceIntakeQuestionItem } from '@ikaro/types';

export const INTAKE_ERROR_COLOR = '#b91c1c';

// A field error sits on the tenant's own page colour, which can be dark: a fixed pale chip paired
// with fixed dark-red text stays legible whatever the branding (axe caught red-on-navy otherwise).
export const INTAKE_ERROR_CHIP_CLASS = 'mt-1 inline-block px-2 py-1 text-sm';
export const INTAKE_ERROR_CHIP_STYLE = {
  backgroundColor: '#fef2f2',
  color: INTAKE_ERROR_COLOR,
  borderRadius: 'var(--ba-radius)',
} as const;

interface IntakeQuestionFieldProps {
  readonly question: ServiceIntakeQuestionItem;
  readonly value: string | boolean | undefined;
  readonly hasError: boolean;
  readonly onChange: (value: string | boolean) => void;
}

const inputStyle = (hasError: boolean): React.CSSProperties => ({
  borderRadius: 'var(--ba-radius)',
  borderColor: hasError ? INTAKE_ERROR_COLOR : 'var(--ba-secondary)',
  backgroundColor: 'var(--ba-secondary)',
  color: 'var(--ba-text)',
});

function FieldError({ fieldKey }: { readonly fieldKey: string }): React.JSX.Element {
  const t = useTranslations('booking.intake');
  return (
    <p
      id={`intake-error-${fieldKey}`}
      className={INTAKE_ERROR_CHIP_CLASS}
      style={INTAKE_ERROR_CHIP_STYLE}
      data-testid="intake-field-error"
      data-field-key={fieldKey}
    >
      {t('requiredError')}
    </p>
  );
}

function QuestionLabel({
  question,
  htmlFor,
}: {
  readonly question: ServiceIntakeQuestionItem;
  readonly htmlFor: string;
}): React.JSX.Element {
  const t = useTranslations('booking.intake');
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-sm font-medium"
      style={{ color: 'var(--ba-text)' }}
    >
      {question.label}{' '}
      <span aria-hidden={question.required ? 'true' : undefined}>
        {question.required ? '*' : t('optional')}
      </span>
    </label>
  );
}

function YesNoPair({
  question,
  value,
  hasError,
  onChange,
}: IntakeQuestionFieldProps): React.JSX.Element {
  const t = useTranslations('booking.intake');
  const name = `intake-${question.fieldKey}`;
  return (
    <fieldset
      role="radiogroup"
      aria-required="true"
      className="my-4 border-0 p-0"
      data-testid="intake-field-bool"
      data-field-key={question.fieldKey}
      aria-invalid={hasError ? true : undefined}
      aria-describedby={hasError ? `intake-error-${question.fieldKey}` : undefined}
    >
      <legend className="mb-1.5 text-sm font-medium" style={{ color: 'var(--ba-text)' }}>
        {question.label} <span aria-hidden="true">*</span>
      </legend>
      {([true, false] as const).map((answer) => (
        <label key={String(answer)} className="mr-5 inline-flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name={name}
            data-testid="intake-bool-option"
            data-field-key={question.fieldKey}
            data-answer={String(answer)}
            checked={value === answer}
            onChange={() => onChange(answer)}
          />
          {answer ? t('yes') : t('no')}
        </label>
      ))}
      {hasError && <FieldError fieldKey={question.fieldKey} />}
    </fieldset>
  );
}

export function IntakeQuestionField(props: IntakeQuestionFieldProps): React.JSX.Element {
  const { question, value, hasError, onChange } = props;
  const id = `intake-q-${question.fieldKey}`;

  if (question.type === 'BOOLEAN' && question.required) return <YesNoPair {...props} />;

  if (question.type === 'BOOLEAN') {
    return (
      <label className="my-4 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          data-testid="intake-bool-checkbox"
          data-field-key={question.fieldKey}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{question.label}</span>
      </label>
    );
  }

  return (
    <div className="mb-4">
      <QuestionLabel question={question} htmlFor={id} />
      <textarea
        id={id}
        data-testid="intake-input"
        data-field-key={question.fieldKey}
        rows={2}
        className="w-full border px-3 py-2"
        style={inputStyle(hasError)}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={hasError ? true : undefined}
        aria-describedby={hasError ? `intake-error-${question.fieldKey}` : undefined}
      />
      {hasError && <FieldError fieldKey={question.fieldKey} />}
    </div>
  );
}
