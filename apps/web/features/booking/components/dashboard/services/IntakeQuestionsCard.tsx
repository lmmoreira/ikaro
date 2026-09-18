'use client';

import { useTranslations } from 'next-intl';
import type { ServiceIntakeQuestionType } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { IntakeQuestionCard, type IntakeQuestionDraft } from './IntakeQuestionCard';

interface IntakeQuestionsCardProps {
  readonly questions: readonly IntakeQuestionDraft[];
  readonly resolveFieldKey: (question: IntakeQuestionDraft) => string;
  readonly hasDuplicateFieldKeys: boolean;
  readonly hasBlankLabel: boolean;
  readonly canAddQuestion: boolean;
  readonly onAdd: () => void;
  readonly onMove: (key: string, direction: -1 | 1) => void;
  readonly onRemove: (key: string) => void;
  readonly onChangeLabel: (key: string, label: string) => void;
  readonly onChangeType: (key: string, type: ServiceIntakeQuestionType) => void;
  readonly onChangeRequired: (key: string, required: boolean) => void;
}

export function IntakeQuestionsCard({
  questions,
  resolveFieldKey,
  hasDuplicateFieldKeys,
  hasBlankLabel,
  canAddQuestion,
  onAdd,
  onMove,
  onRemove,
  onChangeLabel,
  onChangeType,
  onChangeRequired,
}: IntakeQuestionsCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-gray-900">{t('formularioQuestionsCardTitle')}</h2>
        <p className="text-xs text-gray-500">{t('formularioQuestionsHint')}</p>

        {questions.length === 0 && (
          <p
            data-testid="intake-questions-empty"
            className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-gray-500"
          >
            {t('formularioQuestionsEmptyHint')}
          </p>
        )}

        <div data-testid="intake-questions-list" className="space-y-3">
          {questions.map((question, index) => (
            <IntakeQuestionCard
              key={question.key}
              question={question}
              index={index}
              isFirst={index === 0}
              isLast={index === questions.length - 1}
              resolvedFieldKey={resolveFieldKey(question)}
              onMove={(direction) => onMove(question.key, direction)}
              onRemove={() => onRemove(question.key)}
              onChangeLabel={(label) => onChangeLabel(question.key, label)}
              onChangeType={(type) => onChangeType(question.key, type)}
              onChangeRequired={(required) => onChangeRequired(question.key, required)}
            />
          ))}
        </div>

        {hasDuplicateFieldKeys && (
          <p data-testid="intake-duplicate-fieldkey-error" className="text-sm text-red-600">
            {t('formularioDuplicateFieldKeyError')}
          </p>
        )}

        {hasBlankLabel && (
          <p data-testid="intake-blank-label-error" className="text-sm text-red-600">
            {t('formularioBlankLabelError')}
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          data-testid="intake-add-question"
          onClick={onAdd}
          disabled={!canAddQuestion}
        >
          {t('formularioAddQuestionButton')}
        </Button>
      </CardContent>
    </Card>
  );
}
