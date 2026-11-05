'use client';

import { useTranslations } from 'next-intl';
import type { ServiceIntakeQuestionType } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { FieldFeedback } from '@/shared/components/ui/field-feedback';
import { IntakeQuestionCard, type IntakeQuestionDraft } from './IntakeQuestionCard';

interface IntakeQuestionsCardProps {
  readonly questions: readonly IntakeQuestionDraft[];
  readonly resolveFieldKey: (question: IntakeQuestionDraft) => string;
  readonly hasDuplicateFieldKeys: boolean;
  readonly hasBlankLabel: boolean;
  readonly hasEmptyFieldKey: boolean;
  readonly canAddQuestion: boolean;
  readonly onAdd: () => void;
  readonly onMove: (key: string, direction: -1 | 1) => void;
  readonly onRemove: (key: string) => void;
  readonly onChangeLabel: (key: string, label: string) => void;
  readonly onChangeType: (key: string, type: ServiceIntakeQuestionType) => void;
  readonly onChangeRequired: (key: string, required: boolean) => void;
  // Tab intro, shown under the title so the tab's first box is the card level with the action pane.
  readonly intro?: string;
}

const DUPLICATE_ID = 'intake-duplicate-fieldkey-error';
const BLANK_ID = 'intake-blank-label-error';
const EMPTY_KEY_ID = 'intake-empty-key-error';

// The label input is the one control a manager edits to fix any of the three messages (the field
// key is derived from it), so a row's label links to every message that applies to it. A blank
// row also resolves to an empty key, and two blank rows share it, so one row can need several.
function labelMessageIds(
  question: IntakeQuestionDraft,
  resolvedKey: string,
  keyCounts: ReadonlyMap<string, number>,
): string[] {
  const blank = question.label.trim().length === 0;
  const ids: string[] = [];
  if (blank) ids.push(BLANK_ID);
  else if (resolvedKey === '') ids.push(EMPTY_KEY_ID);
  if ((keyCounts.get(resolvedKey) ?? 0) > 1) ids.push(DUPLICATE_ID);
  return ids;
}

export function IntakeQuestionsCard({
  questions,
  resolveFieldKey,
  hasDuplicateFieldKeys,
  hasBlankLabel,
  hasEmptyFieldKey,
  canAddQuestion,
  onAdd,
  onMove,
  onRemove,
  onChangeLabel,
  onChangeType,
  onChangeRequired,
  intro,
}: IntakeQuestionsCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const resolvedKeys = questions.map((question) => resolveFieldKey(question));
  const keyCounts = new Map<string, number>();
  for (const key of resolvedKeys) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-gray-900">{t('formularioQuestionsCardTitle')}</h2>
        {intro && <p className="text-sm text-gray-500">{intro}</p>}
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
              resolvedFieldKey={resolvedKeys[index]}
              labelMessageIds={labelMessageIds(question, resolvedKeys[index], keyCounts)}
              onMove={(direction) => onMove(question.key, direction)}
              onRemove={() => onRemove(question.key)}
              onChangeLabel={(label) => onChangeLabel(question.key, label)}
              onChangeType={(type) => onChangeType(question.key, type)}
              onChangeRequired={(required) => onChangeRequired(question.key, required)}
            />
          ))}
        </div>

        {hasDuplicateFieldKeys && (
          <FieldFeedback id={DUPLICATE_ID} testId="intake-duplicate-fieldkey-error">
            {t('formularioDuplicateFieldKeyError')}
          </FieldFeedback>
        )}

        {hasBlankLabel && (
          <FieldFeedback id={BLANK_ID} testId="intake-blank-label-error">
            {t('formularioBlankLabelError')}
          </FieldFeedback>
        )}

        {hasEmptyFieldKey && (
          <FieldFeedback id={EMPTY_KEY_ID} testId="intake-empty-key-error">
            {t('formularioEmptyFieldKeyError')}
          </FieldFeedback>
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
