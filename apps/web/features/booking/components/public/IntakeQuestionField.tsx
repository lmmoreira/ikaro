'use client';

import type React from 'react';
import { BrandedTextarea } from '@/shared/components/hotsite/branded-textarea';
import { useTranslations } from 'next-intl';
import type { ServiceIntakeQuestionItem } from '@ikaro/types';
import { BrandedFieldFeedback } from '@/shared/components/hotsite/branded-field-feedback';

interface IntakeFieldMessageProps {
  readonly id: string;
  readonly testId: string;
  readonly fieldKey?: string;
  readonly className?: string;
  readonly children: React.ReactNode;
}

/**
 * A field's message on the branded component: it sits on the tenant's own page colour, which can
 * be dark, so it paints its own surface. The wrapper keeps the `data-testid` the E2E specs read.
 */
export function IntakeFieldMessage({
  id,
  testId,
  fieldKey,
  className,
  children,
}: IntakeFieldMessageProps): React.JSX.Element {
  return (
    <div className={className} data-testid={testId} data-field-key={fieldKey}>
      <BrandedFieldFeedback id={id}>{children}</BrandedFieldFeedback>
    </div>
  );
}

interface IntakeQuestionFieldProps {
  readonly question: ServiceIntakeQuestionItem;
  readonly value: string | boolean | undefined;
  readonly hasError: boolean;
  readonly onChange: (value: string | boolean) => void;
}

function FieldError({ fieldKey }: { readonly fieldKey: string }): React.JSX.Element {
  const t = useTranslations('booking.intake');
  return (
    <IntakeFieldMessage
      id={`intake-error-${fieldKey}`}
      testId="intake-field-error"
      fieldKey={fieldKey}
    >
      {t('requiredError')}
    </IntakeFieldMessage>
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
      <BrandedTextarea
        id={id}
        data-testid="intake-input"
        data-field-key={question.fieldKey}
        rows={2}
        className="w-full px-3 py-2"
        invalid={hasError}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hasError ? `intake-error-${question.fieldKey}` : undefined}
      />
      {hasError && <FieldError fieldKey={question.fieldKey} />}
    </div>
  );
}
