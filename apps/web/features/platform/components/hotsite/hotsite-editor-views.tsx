'use client';

import type {
  HotsiteAdminContentResponse,
  HotsiteModuleType,
  LeadFormQuestion,
} from '@ikaro/types';
import { ModuleConfigShell } from '@/features/platform/components/hotsite/modules/ModuleConfigShell';
import { MODULE_CONFIG_PANELS, HotsitePreview } from './hotsite-editor-lazy-panels';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { hasQuestionValidationError } from './modules/LeadFormSortableQuestion';

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
export type LeadFormConfigDraft = {
  audienceMode: 'GUEST_AND_CUSTOMER' | 'CUSTOMER_ONLY';
  questions: LeadFormQuestion[];
};

export function mergeLocalDataIntoLayout(
  layout: HotsiteAdminContentResponse['layout'],
  type: HotsiteModuleType,
  localData: Record<string, unknown>,
): HotsiteAdminContentResponse['layout'] {
  return layout.map((module) => (module.type === type ? { ...module, data: localData } : module));
}
export function isModuleDataDirty(
  committed: Record<string, unknown>,
  local: Record<string, unknown>,
): boolean {
  return JSON.stringify(committed) !== JSON.stringify(local);
}
export function extractLeadFormConfig(data: Record<string, unknown>): LeadFormConfigDraft | null {
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

export function applyModuleConfig(
  view: EditorView,
  onLeadFormConfig: (config: LeadFormConfigDraft) => void,
  onCommit: (type: HotsiteModuleType, data: Record<string, unknown>) => void,
  onClearBanner: () => void,
  onClose: () => void,
): void {
  if (view.view !== 'module-config') return;
  let localData = view.localData;
  if (view.type === 'LEAD_FORM') {
    const config = extractLeadFormConfig(localData);
    if (!config || hasInvalidLeadFormQuestion(config)) return;
    onLeadFormConfig(config);
    localData = stripLeadFormConfig(localData);
  }
  onCommit(view.type, localData);
  onClearBanner();
  onClose();
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

// Folds a LEAD_FORM module's teaser data (layout[].data — never carries audienceMode/questions,
// see docs/02-DOMAIN_MODEL.md § LeadFormConfig "Cross-aggregate save") and its separate
// LeadFormConfig portion (audienceMode/questions) into the one merged shape the panel's own
// `data` prop actually is — the same merge configureModule already does for the initial
// `localData`, reused here so the dirty-check's two sides are built the identical way.
function mergeLeadFormBaseline(
  layoutData: Record<string, unknown>,
  leadFormPortion: LeadFormConfigDraft | null,
): Record<string, unknown> {
  return leadFormPortion ? { ...layoutData, ...leadFormPortion } : layoutData;
}

export function cancelModuleConfig(
  view: EditorView,
  draft: HotsiteAdminContentResponse,
  leadFormConfigBaseline: LeadFormConfigDraft | null,
  onConfirmRequired: () => void,
  onCancel: () => void,
): void {
  if (view.view !== 'module-config') return;
  const layoutData = draft.layout.find((module) => module.type === view.type)?.data ?? {};
  const isLeadForm = view.type === 'LEAD_FORM';
  const committed = isLeadForm
    ? mergeLeadFormBaseline(layoutData, leadFormConfigBaseline)
    : layoutData;
  // localData's own LeadFormConfig portion is re-derived through the same extract/strip helpers
  // "Aplicar" uses, discarding hasSubmissions (a read-only annotation, present on localData but
  // never on the baseline above) so it can never itself cause a false "dirty" — not comparing raw
  // localData directly.
  const current = isLeadForm
    ? mergeLeadFormBaseline(
        stripLeadFormConfig(view.localData),
        extractLeadFormConfig(view.localData),
      )
    : view.localData;
  if (isModuleDataDirty(committed, current)) onConfirmRequired();
  else onCancel();
}

export function updateModuleLocalData(
  setView: (updater: (current: EditorView) => EditorView) => void,
  localData: Record<string, unknown>,
): void {
  setView((current) => (current.view === 'module-config' ? { ...current, localData } : current));
}

export function configureModule(
  draft: HotsiteAdminContentResponse,
  type: HotsiteModuleType,
  leadFormConfigDraft: LeadFormConfigDraft | null,
  onConfigure: (view: EditorView) => void,
): void {
  const selected = draft.layout.find((module) => module.type === type);
  const localData =
    type === 'LEAD_FORM' && leadFormConfigDraft
      ? { ...selected?.data, ...leadFormConfigDraft }
      : (selected?.data ?? {});
  onConfigure({ view: 'module-config', type, localData });
}
export function ModuleConfigView({
  type,
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
      <Panel data={localData} onChange={onChange} />
    </ModuleConfigShell>
  );
}
export function ModuleConfigPreviewView({
  draft,
  type,
  localData,
  onPublish,
  isPublishing,
}: {
  readonly draft: HotsiteAdminContentResponse;
  readonly type: HotsiteModuleType;
  readonly localData: Record<string, unknown>;
  readonly onPublish: () => void;
  readonly isPublishing: boolean;
}): React.JSX.Element {
  return (
    <HotsitePreview
      draft={{ ...draft, layout: mergeLocalDataIntoLayout(draft.layout, type, localData) }}
      onPublish={onPublish}
      isPublishing={isPublishing}
    />
  );
}
