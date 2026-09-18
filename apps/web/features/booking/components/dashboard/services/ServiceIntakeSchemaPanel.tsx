'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ServiceIntakeSchemaVersion } from '@ikaro/types';
import { usePublishServiceIntakeSchema } from '@/features/booking/services/useServices';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { Button } from '@/shared/components/ui/button';
import type { IntakeQuestionDraft } from './IntakeQuestionCard';
import { IntakeQuestionsCard } from './IntakeQuestionsCard';
import { IntakeParticipantsCard, IntakeConsentCard } from './IntakeParticipantsAndConsentCards';
import { IntakeVersionHistoryCard } from './IntakeVersionHistoryCard';
import { IntakeVersionModal } from './IntakeVersionModal';

// Mirrors the real fieldKey derivation intent (accent-strip + camelCase) — the server is the
// actual source of truth for the final fieldKey; this is a live client-side preview only
// (dev-notes.md § UX review fixes, round 3, item 12).
function slugifyFieldKey(label: string): string {
  const words = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  const [first, ...rest] = words;
  return (
    (first ?? '').toLowerCase() +
    rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('')
  );
}

function newQuestion(key: string): IntakeQuestionDraft {
  return { key, fieldKey: '', label: '', type: 'FREE_TEXT', required: false };
}

interface ServiceIntakeSchemaPanelProps {
  readonly serviceId: string;
  readonly initialActive: ServiceIntakeSchemaVersion | null;
  readonly initialHistory: ServiceIntakeSchemaVersion[];
}

export function ServiceIntakeSchemaPanel({
  serviceId,
  initialActive,
  initialHistory,
}: ServiceIntakeSchemaPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const locale = useResolvedLocale();
  const publishSchema = usePublishServiceIntakeSchema();

  const [questions, setQuestions] = useState<IntakeQuestionDraft[]>(() =>
    (initialActive?.questions ?? []).map((question, index) => ({
      ...question,
      key: `initial-${index}`,
    })),
  );
  const [consentText, setConsentText] = useState(initialActive?.consentText ?? '');
  const [requiresNamedAttendees, setRequiresNamedAttendees] = useState(
    initialActive?.requiresNamedAttendees ?? false,
  );
  const [participantCountRequired, setParticipantCountRequired] = useState(
    initialActive?.participantCountRequired ?? false,
  );
  const [active, setActive] = useState(initialActive);
  const [history, setHistory] = useState(initialHistory);
  const [previewVersion, setPreviewVersion] = useState<ServiceIntakeSchemaVersion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishedMessageVisible, setPublishedMessageVisible] = useState(false);
  const nextKeySeed = useRef(questions.length);

  function addQuestion(): void {
    nextKeySeed.current += 1;
    setQuestions((current) => [...current, newQuestion(`new-${nextKeySeed.current}`)]);
    setPublishedMessageVisible(false);
  }

  function removeQuestion(key: string): void {
    setQuestions((current) => current.filter((question) => question.key !== key));
  }

  function moveQuestion(key: string, direction: -1 | 1): void {
    setQuestions((current) => {
      const index = current.findIndex((question) => question.key === key);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (!moved) return current;
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function updateQuestion(key: string, patch: Partial<IntakeQuestionDraft>): void {
    setQuestions((current) =>
      current.map((question) => (question.key === key ? { ...question, ...patch } : question)),
    );
  }

  const resolvedFieldKeys = questions.map(
    (question) => question.fieldKey || slugifyFieldKey(question.label),
  );
  const hasDuplicateFieldKeys = new Set(resolvedFieldKeys).size !== resolvedFieldKeys.length;
  // Mirrors PublishServiceIntakeSchemaSchema's own shape (packages/validation/src/booking.ts):
  // 1-50 questions, unique fieldKey, label <= 500 chars (enforced via maxLength on the input),
  // consentText <= 5000 chars (enforced via maxLength on the textarea).
  const canPublish =
    questions.length > 0 &&
    questions.length <= 50 &&
    consentText.trim().length > 0 &&
    !hasDuplicateFieldKeys;

  async function handlePublish(): Promise<void> {
    setError(null);
    try {
      const result = await publishSchema.mutateAsync({
        id: serviceId,
        body: {
          questions: questions.map(({ fieldKey, label, type, required }) => ({
            fieldKey: fieldKey || slugifyFieldKey(label),
            label,
            type,
            required,
          })),
          consentText,
          requiresNamedAttendees,
          participantCountRequired,
        },
      });
      if (active) setHistory((current) => [active, ...current]);
      setActive(result);
      setPublishedMessageVisible(true);
    } catch (err) {
      setError(resolveErrorMessageFromApiError(err, locale));
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{t('formularioIntro')}</p>

      <IntakeQuestionsCard
        questions={questions}
        resolveFieldKey={(question) => question.fieldKey || slugifyFieldKey(question.label)}
        hasDuplicateFieldKeys={hasDuplicateFieldKeys}
        canAddQuestion={questions.length < 50}
        onAdd={addQuestion}
        onMove={moveQuestion}
        onRemove={removeQuestion}
        onChangeLabel={(key, label) =>
          updateQuestion(key, { label, fieldKey: slugifyFieldKey(label) })
        }
        onChangeType={(key, type) => updateQuestion(key, { type })}
        onChangeRequired={(key, required) => updateQuestion(key, { required })}
      />

      <IntakeParticipantsCard
        participantCountRequired={participantCountRequired}
        requiresNamedAttendees={requiresNamedAttendees}
        onChangeParticipantCountRequired={setParticipantCountRequired}
        onChangeRequiresNamedAttendees={setRequiresNamedAttendees}
      />

      <IntakeConsentCard consentText={consentText} onChange={setConsentText} />

      <IntakeVersionHistoryCard
        active={active}
        history={history}
        onSelectVersion={setPreviewVersion}
      />

      {error && (
        <div
          role="alert"
          data-testid="intake-error"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          data-testid="intake-publish"
          onClick={handlePublish}
          disabled={!canPublish || publishSchema.isPending}
        >
          {t('formularioPublishButton')}
        </Button>
        {publishedMessageVisible && (
          <span data-testid="intake-published" className="text-sm text-green-600">
            {t('formularioPublishedConfirm')}
          </span>
        )}
      </div>

      {previewVersion && (
        <IntakeVersionModal version={previewVersion} onClose={() => setPreviewVersion(null)} />
      )}
    </div>
  );
}
