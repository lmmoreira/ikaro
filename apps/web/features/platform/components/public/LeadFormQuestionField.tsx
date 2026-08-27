import { useTranslations } from 'next-intl';
import type { LeadFormQuestion } from '@ikaro/types';

interface LeadFormQuestionFieldProps {
  readonly question: LeadFormQuestion;
  readonly value: string | string[] | undefined;
  readonly error?: string;
  readonly onChange: (value: string | string[]) => void;
}

export function LeadFormQuestionField({
  question,
  value,
  error,
  onChange,
}: LeadFormQuestionFieldProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const selected = (value as string[] | undefined) ?? [];
  const labelId = `lead-form-question-${question.id}-label`;
  const errorId = `lead-form-question-${question.id}-error`;

  const requiredOrOptionalSuffix = question.required ? (
    <span className="text-red-600"> *</span>
  ) : (
    <span className="opacity-55"> {t('leadForm.optionalSuffix')}</span>
  );

  const errorMessage = error && (
    <p
      className="mt-1.5 text-sm text-red-600"
      id={errorId}
      data-testid="lead-form-question-error"
      data-question-id={question.id}
    >
      {error}
    </p>
  );

  // Radio/checkbox choices are grouped in a <fieldset>/<legend> — not just a labelled <span> —
  // so assistive tech announces the group's own accessible name and its error association, not
  // just each option's own label text (Codex finding, PR #433 round 10). Reset the fieldset's
  // browser-default border/padding/margin so it matches the plain <div> this replaces visually.
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
    return (
      <fieldset className="m-0 mb-5 border-0 p-0" aria-describedby={error ? errorId : undefined}>
        <legend className="mb-2 block p-0 font-medium">
          {question.label}
          {requiredOrOptionalSuffix}
        </legend>

        {question.type === 'SINGLE_CHOICE' &&
          question.options?.map((option) => (
            <label className="flex items-center gap-2 py-1 text-sm" key={option}>
              <input
                type="radio"
                name={`lead-form-question-${question.id}`}
                data-testid="lead-form-question-option"
                data-question-id={question.id}
                data-option-value={option}
                checked={value === option}
                onChange={() => onChange(option)}
              />
              {option}
            </label>
          ))}

        {question.type === 'MULTIPLE_CHOICE' &&
          question.options?.map((option) => (
            <label className="flex items-center gap-2 py-1 text-sm" key={option}>
              <input
                type="checkbox"
                data-testid="lead-form-question-option"
                data-question-id={question.id}
                data-option-value={option}
                checked={selected.includes(option)}
                onChange={() =>
                  onChange(
                    selected.includes(option)
                      ? selected.filter((o) => o !== option)
                      : [...selected, option],
                  )
                }
              />
              {option}
            </label>
          ))}

        {errorMessage}
      </fieldset>
    );
  }

  return (
    <div className="mb-5">
      <span className="mb-2 block font-medium" id={labelId}>
        {question.label}
        {requiredOrOptionalSuffix}
      </span>

      <textarea
        data-testid="lead-form-question"
        data-question-id={question.id}
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
        className="w-full border px-3 py-2"
        style={{ borderRadius: 'var(--ba-radius)' }}
        rows={3}
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />

      {errorMessage}
    </div>
  );
}
