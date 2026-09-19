'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ServiceIntakeSchemaVersion } from '@ikaro/types';
import { usePublishServiceIntakeSchema } from '@/features/booking/services/useServices';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useRegisterTabAction, type ServiceTabActionChange } from './service-tab-action';
import type { IntakeQuestionDraft } from './IntakeQuestionCard';
import { IntakeQuestionsCard } from './IntakeQuestionsCard';
import { IntakeParticipantsCard, IntakeConsentCard } from './IntakeParticipantsAndConsentCards';
import { IntakeVersionHistoryCard } from './IntakeVersionHistoryCard';
import { IntakeVersionModal } from './IntakeVersionModal';

// The backend never independently re-derives fieldKey — PublishServiceIntakeSchemaUseCase stores
// whatever the client submits, validated only by ServiceIntakeQuestionSchema's own
// fieldKey.min(1).max(100). This *is* the real derivation, not a preview of a server-side one, so
// it must respect the same 100-char cap the shared schema enforces (packages/validation/src/
// booking.ts) — a long, no-space label previously produced a fieldKey the server would 422 on
// after Publish was already enabled (Codex round-3 finding).
const FIELD_KEY_MAX_LENGTH = 100;

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
  const key =
    (first ?? '').toLowerCase() +
    rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');
  return key.slice(0, FIELD_KEY_MAX_LENGTH);
}

function newQuestion(key: string): IntakeQuestionDraft {
  return { key, fieldKey: '', label: '', type: 'FREE_TEXT', required: false };
}

interface ServiceIntakeSchemaPanelProps {
  readonly serviceId: string;
  readonly initialActive: ServiceIntakeSchemaVersion | null;
  readonly initialHistory: ServiceIntakeSchemaVersion[];
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onActionChange: ServiceTabActionChange;
}

export function ServiceIntakeSchemaPanel({
  serviceId,
  initialActive,
  initialHistory,
  onDirtyChange,
  onActionChange,
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
  // Bumped on every draft edit — lets a publish in flight tell whether a *newer* edit landed
  // while it was pending, so it never clears dirty / shows "published" for a draft it didn't
  // actually persist (same race fixed for Detalhes/Políticas; this tab was missed the first time).
  const editRevisionRef = useRef(0);

  function markDirty(): void {
    editRevisionRef.current += 1;
    onDirtyChange(true);
    setPublishedMessageVisible(false);
  }

  function addQuestion(): void {
    nextKeySeed.current += 1;
    setQuestions((current) => [...current, newQuestion(`new-${nextKeySeed.current}`)]);
    markDirty();
  }

  function removeQuestion(key: string): void {
    setQuestions((current) => current.filter((question) => question.key !== key));
    markDirty();
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
    markDirty();
  }

  function updateQuestion(key: string, patch: Partial<IntakeQuestionDraft>): void {
    setQuestions((current) =>
      current.map((question) => (question.key === key ? { ...question, ...patch } : question)),
    );
    markDirty();
  }

  function handleConsentTextChange(value: string): void {
    setConsentText(value);
    markDirty();
  }

  function handleRequiresNamedAttendeesChange(value: boolean): void {
    setRequiresNamedAttendees(value);
    markDirty();
  }

  function handleParticipantCountRequiredChange(value: boolean): void {
    setParticipantCountRequired(value);
    markDirty();
  }

  const resolvedFieldKeys = questions.map(
    (question) => question.fieldKey || slugifyFieldKey(question.label),
  );
  const hasDuplicateFieldKeys = new Set(resolvedFieldKeys).size !== resolvedFieldKeys.length;
  const hasBlankLabel = questions.some((question) => question.label.trim().length === 0);
  // Mirrors PublishServiceIntakeSchemaSchema's own shape (packages/validation/src/booking.ts):
  // 1-50 questions, every label non-empty (fieldKey.min(1)/label.min(1) — a blank label derives
  // an empty fieldKey too), unique fieldKey, label <= 500 chars (enforced via maxLength on the
  // input), consentText <= 5000 chars (enforced via maxLength on the textarea).
  const canPublish =
    questions.length > 0 &&
    questions.length <= 50 &&
    consentText.trim().length > 0 &&
    !hasDuplicateFieldKeys &&
    !hasBlankLabel;

  async function handlePublish(): Promise<void> {
    setError(null);
    const revisionAtSubmit = editRevisionRef.current;
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
      if (editRevisionRef.current === revisionAtSubmit) {
        setPublishedMessageVisible(true);
        onDirtyChange(false);
      }
    } catch (err) {
      setError(resolveErrorMessageFromApiError(err, locale));
    }
  }

  useRegisterTabAction(onActionChange, {
    label: t('formularioPublishButton'),
    disabled: !canPublish || publishSchema.isPending,
    pending: publishSchema.isPending,
    onSubmit: handlePublish,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{t('formularioIntro')}</p>

      <IntakeQuestionsCard
        questions={questions}
        resolveFieldKey={(question) => question.fieldKey || slugifyFieldKey(question.label)}
        hasDuplicateFieldKeys={hasDuplicateFieldKeys}
        hasBlankLabel={hasBlankLabel}
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
        onChangeParticipantCountRequired={handleParticipantCountRequiredChange}
        onChangeRequiresNamedAttendees={handleRequiresNamedAttendeesChange}
      />

      <IntakeConsentCard consentText={consentText} onChange={handleConsentTextChange} />

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

      {publishedMessageVisible && (
        <p data-testid="intake-published" className="text-sm text-green-600">
          {t('formularioPublishedConfirm')}
        </p>
      )}

      {previewVersion && (
        <IntakeVersionModal version={previewVersion} onClose={() => setPreviewVersion(null)} />
      )}
    </div>
  );
}
