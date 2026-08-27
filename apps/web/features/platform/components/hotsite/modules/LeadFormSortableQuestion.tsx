'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LeadFormQuestion, LeadFormQuestionType } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';

export type AdminQuestion = LeadFormQuestion & { hasSubmissions?: boolean };

const QUESTION_TYPES: readonly LeadFormQuestionType[] = [
  'TEXT',
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
];

function isChoiceQuestion(type: LeadFormQuestionType): boolean {
  return type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
}

export function hasQuestionValidationError(question: AdminQuestion): boolean {
  return (
    question.label.trim() === '' ||
    (isChoiceQuestion(question.type) &&
      ((question.options?.length ?? 0) < 2 || (question.options?.length ?? 0) > 10))
  );
}

export function LeadFormSortableQuestion({
  question,
  index,
  onChange,
  onRemove,
}: {
  readonly question: AdminQuestion;
  readonly index: number;
  readonly onChange: (question: AdminQuestion) => void;
  readonly onRemove: () => void;
}): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.leadForm');
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: question.id,
  });
  const options = question.options ?? [];
  const invalid = hasQuestionValidationError(question);
  // `open` starts in sync with `invalid` (a freshly added/invalid question is expanded by
  // default) but is then user-controlled — deriving it straight from `invalid` on every render
  // would force the <details> shut the moment the admin's first keystroke makes the question
  // valid, discarding their own edit context mid-typing. The reverse direction (valid ->
  // invalid, e.g. removing an option down to 1 while open, then manually collapsing) has no such
  // downside: force it back open so the inline error text isn't hidden inside a collapsed card
  // (Codex review finding, M20-S08 PR #429, 2026-08-26) — a collapsed invalid card still gets a
  // red border, but only the expanded body carries the specific validation message. Adjusted
  // during render (React's own documented pattern for "state derived from a changing prop"),
  // not a useEffect — react-hooks/set-state-in-effect correctly flags a setState-in-effect here
  // as a needless extra render pass.
  const [open, setOpen] = useState(invalid);
  const [prevInvalid, setPrevInvalid] = useState(invalid);
  if (invalid !== prevInvalid) {
    setPrevInvalid(invalid);
    if (invalid) setOpen(true);
  }
  const style = { transform: CSS.Transform.toString(transform), transition };

  function update(patch: Partial<AdminQuestion>): void {
    onChange({ ...question, ...patch });
  }

  function changeType(type: LeadFormQuestionType): void {
    update({ type, options: isChoiceQuestion(type) ? options : undefined });
  }

  return (
    <details
      ref={setNodeRef}
      style={style}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className={`rounded-lg border bg-white ${invalid ? 'border-red-300' : 'border-gray-200'}`}
      data-testid="lead-form-question"
      data-question-index={index}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <button
          type="button"
          className="cursor-grab touch-none text-gray-400 active:cursor-grabbing"
          aria-label={t('question.dragLabel', { index: index + 1 })}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <span className="flex-1 truncate font-semibold text-gray-900">
          {question.label || t('question.untitled', { index: index + 1 })}
        </span>
        {question.hasSubmissions === true && (
          <span className="text-xs text-gray-500">{t('question.hasSubmissions')}</span>
        )}
      </summary>
      <div className="space-y-4 border-t border-gray-100 p-4">
        <div>
          <label
            htmlFor={`lead-question-label-${question.id}`}
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('question.label')}
          </label>
          <input
            id={`lead-question-label-${question.id}`}
            data-testid="lead-form-question-label"
            value={question.label}
            onChange={(event) => update({ label: event.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        {invalid && question.label.trim() === '' && (
          <p className="text-sm text-red-600">{t('validation.questionLabel')}</p>
        )}
        <div>
          <label
            htmlFor={`lead-question-type-${question.id}`}
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('question.type')}
          </label>
          <select
            id={`lead-question-type-${question.id}`}
            data-testid="lead-form-question-type"
            value={question.type}
            onChange={(event) => changeType(event.target.value as LeadFormQuestionType)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`question.types.${type}`)}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(event) => update({ required: event.target.checked })}
          />
          {t('question.required')}
        </label>
        {isChoiceQuestion(question.type) && (
          <div className="space-y-2">
            <span className="block text-sm font-semibold">{t('question.options')}</span>
            {options.map((option, optionIndex) => (
              <div key={`${question.id}-${optionIndex}`} className="flex gap-2">
                <input
                  value={option}
                  aria-label={t('question.optionLabel', { index: optionIndex + 1 })}
                  data-testid="lead-form-question-option"
                  data-option-index={optionIndex}
                  onChange={(event) => {
                    const next = [...options];
                    next[optionIndex] = event.target.value;
                    update({ options: next });
                  }}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  aria-label={t('question.removeOption')}
                  onClick={() => update({ options: options.filter((_, i) => i !== optionIndex) })}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={options.length >= 10}
              onClick={() => update({ options: [...options, ''] })}
            >
              {t('question.addOption')}
            </Button>
            {invalid && (options.length < 2 || options.length > 10) && (
              <p className="text-sm text-red-600">{t('validation.options')}</p>
            )}
          </div>
        )}
        <Button type="button" variant="ghost" className="text-red-600" onClick={onRemove}>
          {t('question.remove')}
        </Button>
      </div>
    </details>
  );
}
