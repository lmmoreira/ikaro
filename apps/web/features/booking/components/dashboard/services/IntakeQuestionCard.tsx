'use client';

import { useTranslations } from 'next-intl';
import type { ServiceIntakeQuestionType } from '@ikaro/types';

export interface IntakeQuestionDraft {
  readonly key: string;
  readonly fieldKey: string;
  readonly label: string;
  readonly type: ServiceIntakeQuestionType;
  readonly required: boolean;
}

interface IntakeQuestionCardProps {
  readonly question: IntakeQuestionDraft;
  readonly index: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly resolvedFieldKey: string;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onRemove: () => void;
  readonly onChangeLabel: (label: string) => void;
  readonly onChangeType: (type: ServiceIntakeQuestionType) => void;
  readonly onChangeRequired: (required: boolean) => void;
}

// One question row inside ServiceIntakeSchemaPanel's builder — data-testid stays static across
// every row (E2E-3, docs/08-TESTING_STRATEGY.md), disambiguated by the sibling
// data-question-index attribute instead of a template-literal testid.
export function IntakeQuestionCard({
  question,
  index,
  isFirst,
  isLast,
  resolvedFieldKey,
  onMove,
  onRemove,
  onChangeLabel,
  onChangeType,
  onChangeRequired,
}: IntakeQuestionCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const labelId = `intake-question-${question.key}-label`;
  const typeId = `intake-question-${question.key}-type`;
  const requiredId = `intake-question-${question.key}-required`;

  return (
    <div
      data-testid="intake-question"
      data-question-index={index}
      className="rounded-2xl border border-slate-200 p-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
          {index + 1}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={t('formularioMoveQuestionUp')}
            data-testid="intake-question-up"
            data-question-index={index}
            disabled={isFirst}
            onClick={() => onMove(-1)}
            className="rounded p-1 text-gray-500 hover:bg-slate-100 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={t('formularioMoveQuestionDown')}
            data-testid="intake-question-down"
            data-question-index={index}
            disabled={isLast}
            onClick={() => onMove(1)}
            className="rounded p-1 text-gray-500 hover:bg-slate-100 disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={t('formularioRemoveQuestion')}
            data-testid="intake-question-remove"
            data-question-index={index}
            onClick={onRemove}
            className="rounded p-1 text-gray-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={labelId} className="mb-1 block text-xs font-semibold text-gray-500">
            {t('formularioQuestionLabelLabel')}
          </label>
          <input
            id={labelId}
            data-testid="intake-question-label"
            data-question-index={index}
            value={question.label}
            onChange={(event) => onChangeLabel(event.target.value)}
            maxLength={500}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <p
            data-testid="intake-question-fieldkey"
            data-question-index={index}
            className="mt-1 text-xs text-gray-500"
          >
            {t('formularioQuestionFieldKeyHint', { fieldKey: resolvedFieldKey })}
          </p>
        </div>
        <div>
          <label htmlFor={typeId} className="mb-1 block text-xs font-semibold text-gray-500">
            {t('formularioQuestionTypeLabel')}
          </label>
          <select
            id={typeId}
            data-testid="intake-question-type"
            data-question-index={index}
            value={question.type}
            onChange={(event) => onChangeType(event.target.value as ServiceIntakeQuestionType)}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          >
            <option value="FREE_TEXT">{t('formularioQuestionTypeFreeText')}</option>
            <option value="NAMED_ATTENDEES">{t('formularioQuestionTypeNamedAttendees')}</option>
            <option value="PICKUP_ADDRESS">{t('formularioQuestionTypePickupAddress')}</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <input
          id={requiredId}
          type="checkbox"
          data-testid="intake-question-required"
          data-question-index={index}
          checked={question.required}
          onChange={(event) => onChangeRequired(event.target.checked)}
        />
        <label htmlFor={requiredId}>{t('formularioQuestionRequiredLabel')}</label>
      </div>
    </div>
  );
}
