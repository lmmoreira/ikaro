'use client';

import type {
  HotsiteAdminContentResponse,
  HotsiteModuleType,
  LeadFormQuestion,
} from '@ikaro/types';
import { ModuleConfigShell } from '@/features/platform/components/hotsite/modules/ModuleConfigShell';
import { MODULE_CONFIG_PANELS } from './hotsite-editor-lazy-panels';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { hasQuestionValidationError } from './modules/LeadFormSortableQuestion';
import {
  splitPresentation,
  withPresentation,
} from '@/features/platform/hotsite/module-presentation';

export type EditorView =
  | { readonly view: 'tabs' }
  | { readonly view: 'preview' }
  | {
      readonly view: 'module-config';
      readonly type: HotsiteModuleType;
      readonly localData: Record<string, unknown>;
    }
  | {
      readonly view: 'module-config-preview';
      readonly type: HotsiteModuleType;
      readonly localData: Record<string, unknown>;
    };

export type EditorMode = 'visual' | 'detailed';
// What the visual editor's inspector is showing. A module context carries its own local buffer
// (the same `localData` semantics as the detailed editor's module-config view), so a module
// context can never exist without one.
export type VisualContext =
  | { readonly kind: 'structure' | 'branding' | 'sharing' | 'templates' }
  | {
      readonly kind: 'module';
      readonly type: HotsiteModuleType;
      readonly localData: Record<string, unknown>;
    };
export type LeadFormConfigDraft = {
  audienceMode: 'GUEST_AND_CUSTOMER' | 'CUSTOMER_ONLY';
  questions: LeadFormQuestion[];
};

// `localData` is a module's edit buffer: its data with its section `presentation` folded in under a
// reserved key (module-presentation.ts), split back onto the module entry here.
export function mergeLocalDataIntoLayout(
  layout: HotsiteAdminContentResponse['layout'],
  type: HotsiteModuleType,
  localData: Record<string, unknown>,
): HotsiteAdminContentResponse['layout'] {
  const { data, presentation } = splitPresentation(localData);
  return layout.map((module) => {
    if (module.type !== type) return module;
    const next = { ...module, data };
    delete next.presentation;
    return presentation === undefined ? next : { ...next, presentation };
  });
}
export function isModuleDataDirty(
  committed: Record<string, unknown>,
  local: Record<string, unknown>,
): boolean {
  return JSON.stringify(committed) !== JSON.stringify(local);
}
// Takes the two LeadFormConfig fields structurally (not Record<string, unknown>) so both the panel's
// local buffer and the GET /lead-form/config response can be passed without a cast.
export function extractLeadFormConfig(data: {
  readonly audienceMode?: unknown;
  readonly questions?: unknown;
}): LeadFormConfigDraft | null {
  if (
    !['GUEST_AND_CUSTOMER', 'CUSTOMER_ONLY'].includes(data.audienceMode as string) ||
    !Array.isArray(data.questions)
  )
    return null;
  return {
    audienceMode: data.audienceMode as LeadFormConfigDraft['audienceMode'],
    questions: data.questions.map((question) => {
      const next = { ...(question as LeadFormQuestion & { hasSubmissions?: boolean }) };
      delete next.hasSubmissions;
      return next;
    }),
  };
}
export function stripLeadFormConfig(data: Record<string, unknown>): Record<string, unknown> {
  const next = { ...data };
  delete next.audienceMode;
  delete next.questions;
  return next;
}
export function hasInvalidLeadFormQuestion(config: LeadFormConfigDraft): boolean {
  return config.questions.some(hasQuestionValidationError);
}

export async function executeUnpublish(
  unpublish: { mutateAsync: () => Promise<unknown> },
  locale: 'pt-BR' | 'en',
  onSuccess: () => void,
  onError: (message: string) => void,
): Promise<void> {
  try {
    await unpublish.mutateAsync();
    onSuccess();
  } catch (error) {
    onError(resolveErrorMessageFromApiError(error, locale));
  }
  globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
}

export function updateEditorDraft(
  setDraft: (
    updater: (current: HotsiteAdminContentResponse) => HotsiteAdminContentResponse,
  ) => void,
  clearBanner: () => void,
  updater: (current: HotsiteAdminContentResponse) => HotsiteAdminContentResponse,
): void {
  setDraft(updater);
  clearBanner();
}

export function updateModuleLocalData(
  setView: (updater: (current: EditorView) => EditorView) => void,
  localData: Record<string, unknown>,
): void {
  setView((current) => (current.view === 'module-config' ? { ...current, localData } : current));
}

// The local edit buffer a module's panel starts from: its layout[].data, with a LEAD_FORM's
// separately held LeadFormConfig portion folded in (it never lives in layout[].data).
export function buildModuleBuffer(
  draft: HotsiteAdminContentResponse,
  type: HotsiteModuleType,
  leadFormConfigDraft: LeadFormConfigDraft | null,
): Record<string, unknown> {
  const selected = draft.layout.find((module) => module.type === type);
  const data =
    type === 'LEAD_FORM' && leadFormConfigDraft
      ? { ...selected?.data, ...leadFormConfigDraft }
      : (selected?.data ?? {});
  return withPresentation(data, selected?.presentation);
}

export function configureModule(
  draft: HotsiteAdminContentResponse,
  type: HotsiteModuleType,
  leadFormConfigDraft: LeadFormConfigDraft | null,
  onConfigure: (view: EditorView) => void,
): void {
  onConfigure({
    view: 'module-config',
    type,
    localData: buildModuleBuffer(draft, type, leadFormConfigDraft),
  });
}
export function ModuleConfigView({
  type,
  layout,
  localData,
  moduleLabel,
  onBack,
  onApply,
  onPreview,
  discardConfirmOpen,
  onConfirmDiscard,
  onCancelDiscard,
  onChange,
}: {
  readonly type: HotsiteModuleType;
  readonly layout: HotsiteAdminContentResponse['layout'];
  readonly localData: Record<string, unknown>;
  readonly moduleLabel: string;
  readonly onBack: () => void;
  readonly onApply: () => void;
  readonly onPreview: () => void;
  readonly discardConfirmOpen: boolean;
  readonly onConfirmDiscard: () => void;
  readonly onCancelDiscard: () => void;
  readonly onChange: (data: Record<string, unknown>) => void;
}): React.JSX.Element {
  const Panel = MODULE_CONFIG_PANELS[type];
  if (!Panel) return <></>;
  return (
    <ModuleConfigShell
      moduleLabel={moduleLabel}
      onBack={onBack}
      onApply={onApply}
      onPreview={onPreview}
      discardConfirmOpen={discardConfirmOpen}
      onConfirmDiscard={onConfirmDiscard}
      onCancelDiscard={onCancelDiscard}
    >
      <Panel data={localData} onChange={onChange} layout={layout} />
    </ModuleConfigShell>
  );
}
