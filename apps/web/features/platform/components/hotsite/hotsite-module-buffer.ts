import {
  ContentBlockModuleDataSchema,
  HotsiteModulePresentationSchema,
  NavigationModuleDataSchema,
  type HotsiteAdminContentResponse,
  type HotsiteModuleType,
} from '@ikaro/types';
import {
  isPresentationEqual,
  splitPresentation,
} from '@/features/platform/hotsite/module-presentation';
import {
  extractLeadFormConfig,
  hasInvalidLeadFormQuestion,
  isModuleDataDirty,
  mergeLocalDataIntoLayout,
  stripLeadFormConfig,
  type EditorView,
  type LeadFormConfigDraft,
} from './hotsite-editor-views';

// A module's local edit buffer: what both the detailed drill-down and the visual inspector edit
// until "Aplicar" commits it into the shared draft.
export interface ModuleBuffer {
  readonly type: HotsiteModuleType;
  readonly localData: Record<string, unknown>;
}

// NAVIGATION and CONTENT_BLOCK are the two strict, closed shapes a panel can leave momentarily
// incomplete (a collage with fewer than two images, a navigation item with no label), and any
// module's `presentation` can hold a half-typed colour. The client drops a module whose data does
// not parse, and the backend would refuse the save, so such a buffer is never committed and the
// panel says what is missing.
export function isModuleDataApplicable(
  type: HotsiteModuleType,
  localData: Record<string, unknown>,
): boolean {
  const { data, presentation } = splitPresentation(localData);
  if (
    presentation !== undefined &&
    !HotsiteModulePresentationSchema.safeParse(presentation).success
  ) {
    return false;
  }
  if (type === 'NAVIGATION') return NavigationModuleDataSchema.safeParse(data).success;
  if (type === 'CONTENT_BLOCK') return ContentBlockModuleDataSchema.safeParse(data).success;
  return true;
}

// Commits a buffer. A LEAD_FORM buffer is split here: its audienceMode/questions go to the
// LeadFormConfig session state and are stripped from the layout[].data that is committed. Returns
// false — committing nothing — when a LEAD_FORM buffer is invalid, or a NAVIGATION/CONTENT_BLOCK
// buffer does not parse.
export function commitModuleBuffer(
  buffer: ModuleBuffer,
  onLeadFormConfig: (config: LeadFormConfigDraft) => void,
  onCommit: (type: HotsiteModuleType, data: Record<string, unknown>) => void,
): boolean {
  if (!isModuleDataApplicable(buffer.type, buffer.localData)) return false;
  let localData = buffer.localData;
  if (buffer.type === 'LEAD_FORM') {
    const config = extractLeadFormConfig(localData);
    if (!config || hasInvalidLeadFormQuestion(config)) return false;
    onLeadFormConfig(config);
    localData = stripLeadFormConfig(localData);
  }
  onCommit(buffer.type, localData);
  return true;
}

export function applyModuleConfig(
  view: EditorView,
  onLeadFormConfig: (config: LeadFormConfigDraft) => void,
  onCommit: (type: HotsiteModuleType, data: Record<string, unknown>) => void,
  onClearBanner: () => void,
  onClose: () => void,
): void {
  if (view.view !== 'module-config') return;
  if (!commitModuleBuffer(view, onLeadFormConfig, onCommit)) return;
  onClearBanner();
  onClose();
}

// The draft as the preview should show it while a module is being edited: the buffer merged into
// its layout entry. A LEAD_FORM buffer also carries the LeadFormConfig portion
// (audienceMode/questions), which is never layout data — it is stripped so it can never reach the
// rendered module's props.
export function buildPreviewDraft(
  draft: HotsiteAdminContentResponse,
  buffer: ModuleBuffer | null,
): HotsiteAdminContentResponse {
  if (!buffer) return draft;
  const data =
    buffer.type === 'LEAD_FORM' ? stripLeadFormConfig(buffer.localData) : buffer.localData;
  return { ...draft, layout: mergeLocalDataIntoLayout(draft.layout, buffer.type, data) };
}

// Folds a LEAD_FORM module's teaser data (layout[].data — never carries audienceMode/questions,
// see docs/DOMAIN_MODEL.md § LeadFormConfig "Cross-aggregate save") and its separate
// LeadFormConfig portion (audienceMode/questions) into the one merged shape the panel's own
// `data` prop actually is — the same merge configureModule already does for the initial
// `localData`, reused here so the dirty-check's two sides are built the identical way.
function mergeLeadFormBaseline(
  layoutData: Record<string, unknown>,
  leadFormPortion: LeadFormConfigDraft | null,
): Record<string, unknown> {
  return leadFormPortion ? { ...layoutData, ...leadFormPortion } : layoutData;
}

export function isModuleBufferDirty(
  buffer: ModuleBuffer,
  draft: HotsiteAdminContentResponse,
  leadFormConfigBaseline: LeadFormConfigDraft | null,
): boolean {
  const committedModule = draft.layout.find((module) => module.type === buffer.type);
  const layoutData = committedModule?.data ?? {};
  // `presentation` rides in the buffer under a reserved key; it is compared on its own, by
  // structure, so the data comparison below is untouched by where the key happens to sit.
  const { data: bufferData, presentation: bufferPresentation } = splitPresentation(
    buffer.localData,
  );
  if (!isPresentationEqual(committedModule?.presentation, bufferPresentation)) return true;
  const isLeadForm = buffer.type === 'LEAD_FORM';
  // A LEAD_FORM buffer that has no LeadFormConfig portion yet is one whose panel is still loading
  // it, so nothing in it can be an edit: it is compared against the layout data alone, never
  // against a baseline that has just arrived ahead of the panel's own sync.
  const hasLeadFormPortion = isLeadForm && extractLeadFormConfig(bufferData) !== null;
  const committed = hasLeadFormPortion
    ? mergeLeadFormBaseline(layoutData, leadFormConfigBaseline)
    : layoutData;
  // localData's own LeadFormConfig portion is re-derived through the same extract/strip helpers
  // "Aplicar" uses, discarding hasSubmissions (a read-only annotation, present on localData but
  // never on the baseline above) so it can never itself cause a false "dirty" — not comparing raw
  // localData directly.
  const current = isLeadForm
    ? mergeLeadFormBaseline(stripLeadFormConfig(bufferData), extractLeadFormConfig(bufferData))
    : bufferData;
  return isModuleDataDirty(committed, current);
}

export function cancelModuleConfig(
  view: EditorView,
  draft: HotsiteAdminContentResponse,
  leadFormConfigBaseline: LeadFormConfigDraft | null,
  onConfirmRequired: () => void,
  onCancel: () => void,
): void {
  if (view.view !== 'module-config') return;
  if (isModuleBufferDirty(view, draft, leadFormConfigBaseline)) onConfirmRequired();
  else onCancel();
}
