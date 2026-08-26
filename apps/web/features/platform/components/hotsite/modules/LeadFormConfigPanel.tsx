'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button } from '@/shared/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { useLeadFormConfig } from '@/features/platform/hotsite/useHotsite';
import {
  readModuleData,
  writeModuleData,
  type ModuleConfigPanelProps,
} from './module-config-panel.types';
import { LeadFormSortableQuestion, type AdminQuestion } from './LeadFormSortableQuestion';
import { LeadFormTeaserFields } from './LeadFormTeaserFields';
type LeadFormDraft = Record<string, unknown> & {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  ctaLabel: string;
  variant?: 'centered' | 'left-aligned';
  backgroundImageUrl?: string | null;
  backgroundImagePosition?: 'left' | 'center' | 'right';
  bgStyle?: 'primary' | 'background';
  audienceMode: 'GUEST_AND_CUSTOMER' | 'CUSTOMER_ONLY';
  questions: AdminQuestion[];
};

function normalizeQuestions(questions: readonly AdminQuestion[]): AdminQuestion[] {
  return questions.map((question, order) => ({ ...question, order }));
}

function newQuestion(): AdminQuestion {
  return { id: globalThis.crypto.randomUUID(), label: '', type: 'TEXT', required: false, order: 0 };
}

function starterQuestion(label: string): AdminQuestion {
  return { ...newQuestion(), label };
}

export function LeadFormConfigPanel({ data, onChange }: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.leadForm');
  const base = readModuleData<Partial<LeadFormDraft>>(data);
  const config = useLeadFormConfig();
  // `audienceMode`/`questions` only exist in the editor-owned temporary draft. When the panel is
  // reopened after Aplicar, that draft must win over the cached pre-publish GET response.
  const initialized = useRef(base.audienceMode !== undefined || base.questions !== undefined);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeadFormDraft>(() => ({
    title: base.title ?? '',
    subtitle: base.subtitle,
    eyebrow: base.eyebrow,
    ctaLabel: base.ctaLabel ?? '',
    variant: base.variant ?? 'centered',
    backgroundImageUrl: base.backgroundImageUrl,
    backgroundImagePosition: base.backgroundImagePosition ?? 'center',
    bgStyle: base.bgStyle ?? 'background',
    audienceMode: base.audienceMode ?? 'GUEST_AND_CUSTOMER',
    questions: base.questions ?? [],
  }));

  useEffect(() => {
    if (!config.data || initialized.current) return;
    initialized.current = true;
    const next = {
      ...config.data,
      questions: normalizeQuestions(config.data.questions),
    } as LeadFormDraft;
    setDraft(next);
    onChange(writeModuleData(next));
  }, [config.data, onChange]);

  function update(patch: Partial<LeadFormDraft>): void {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange(writeModuleData(next));
  }

  function addQuestion(question = newQuestion()): void {
    update({ questions: normalizeQuestions([...draft.questions, question]) });
  }

  function removeQuestion(question: AdminQuestion): void {
    if (question.hasSubmissions) {
      setConfirmRemoveId(question.id);
      return;
    }
    update({
      questions: normalizeQuestions(draft.questions.filter((item) => item.id !== question.id)),
    });
  }

  function confirmRemove(): void {
    if (!confirmRemoveId) return;
    update({
      questions: normalizeQuestions(
        draft.questions.filter((question) => question.id !== confirmRemoveId),
      ),
    });
    setConfirmRemoveId(null);
  }

  function handleDragEnd({ active, over }: DragEndEvent): void {
    if (!over || active.id === over.id) return;
    const oldIndex = draft.questions.findIndex((question) => question.id === active.id);
    const newIndex = draft.questions.findIndex((question) => question.id === over.id);
    update({ questions: normalizeQuestions(arrayMove(draft.questions, oldIndex, newIndex)) });
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (config.isLoading) return <p>{t('loading')}</p>;
  if (config.isError) return <p role="alert">{t('loadError')}</p>;

  return (
    <div className="space-y-6" data-testid="lead-form-config-panel">
      <LeadFormTeaserFields draft={draft} onChange={update} />
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">{t('audience.title')}</h2>
        <select
          aria-label={t('audience.label')}
          value={draft.audienceMode}
          onChange={(event) =>
            update({ audienceMode: event.target.value as LeadFormDraft['audienceMode'] })
          }
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="GUEST_AND_CUSTOMER">{t('audience.guestAndCustomer')}</option>
          <option value="CUSTOMER_ONLY">{t('audience.customerOnly')}</option>
        </select>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{t('questions.title')}</h2>
          <span className="text-sm text-gray-500">
            {t('questions.counter', { count: draft.questions.length })}
          </span>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={draft.questions.map((question) => question.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {draft.questions.map((question, index) => (
                <LeadFormSortableQuestion
                  key={question.id}
                  question={question}
                  index={index}
                  onChange={(next) =>
                    update({
                      questions: draft.questions.map((item) =>
                        item.id === question.id ? next : item,
                      ),
                    })
                  }
                  onRemove={() => removeQuestion(question)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <Button
          type="button"
          variant="outline"
          disabled={draft.questions.length >= 20}
          onClick={() => addQuestion()}
        >
          {t('questions.add')}
        </Button>
        <div className="space-y-2">
          <p className="text-sm text-gray-500">{t('questions.startersHint')}</p>
          <div className="flex flex-wrap gap-2">
            {(['bestContactTime', 'howDidYouHear', 'carModel'] as const).map((key) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                size="sm"
                disabled={draft.questions.length >= 20}
                onClick={() => addQuestion(starterQuestion(t(`questions.starters.${key}`)))}
              >
                {t(`questions.starters.${key}`)}
              </Button>
            ))}
          </div>
        </div>
        {draft.questions.length >= 20 && (
          <p className="text-sm text-amber-700">{t('questions.limit')}</p>
        )}
      </div>
      <AlertDialog
        open={confirmRemoveId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('question.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('question.confirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('question.confirmCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>
              {t('question.confirmRemove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
