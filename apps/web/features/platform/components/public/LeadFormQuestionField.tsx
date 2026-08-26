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

  return (
    <div className="mb-5">
      <span className="mb-2 block font-medium" id={labelId}>
        {question.label}
        {question.required ? (
          <span className="text-red-600"> *</span>
        ) : (
          <span className="opacity-55"> {t('leadForm.optionalSuffix')}</span>
        )}
      </span>

      {question.type === 'TEXT' && (
        <textarea
          data-testid={`lead-form-question-${question.id}`}
          aria-labelledby={labelId}
          className="w-full border px-3 py-2"
          style={{ borderRadius: 'var(--ba-radius)' }}
          rows={3}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {question.type === 'SINGLE_CHOICE' &&
        question.options?.map((option) => (
          <label className="flex items-center gap-2 py-1 text-sm" key={option}>
            <input
              type="radio"
              name={`lead-form-question-${question.id}`}
              data-testid={`lead-form-question-${question.id}-${option}`}
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
              data-testid={`lead-form-question-${question.id}-${option}`}
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

      {error && (
        <p
          className="mt-1.5 text-sm text-red-600"
          data-testid={`lead-form-question-${question.id}-error`}
        >
          {error}
        </p>
      )}
    </div>
  );
}
