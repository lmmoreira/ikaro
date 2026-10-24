'use client';

import { useCallback, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import type {
  ApplyHotsiteTemplateResponse,
  HotsiteAdminContentResponse,
  HotsiteTemplateId,
  HotsiteTemplateSummaryResponse,
} from '@ikaro/types';
import {
  useApplyHotsiteTemplate,
  useHotsiteTemplates,
} from '@/features/platform/hotsite/useHotsite';
import {
  applyTemplateResult,
  buildApplyRequest,
  countTenantImagesReplacedByTemplate,
  restoreUndoSnapshot,
  shouldConfirmUndo,
  undoSnapshotAfterApply,
  type TemplateUndoSnapshot,
} from './hotsite-template-application';

type SetDraft = (
  updater: (current: HotsiteAdminContentResponse) => HotsiteAdminContentResponse,
) => void;
type DraftRef = MutableRefObject<HotsiteAdminContentResponse>;

// Everything the template gallery shows and does. One object, so the visual inspector and the
// detailed Templates tab render the very same session state.
export interface HotsiteTemplatesController {
  readonly templates: readonly HotsiteTemplateSummaryResponse[] | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly reload: () => void;
  // The card applied during this session. The manifest stores no template marker, so nothing is
  // selected after a reload.
  readonly appliedTemplateId: HotsiteTemplateId | null;
  readonly showSampleNotice: boolean;
  readonly isApplying: boolean;
  readonly applyingTemplateId: HotsiteTemplateId | null;
  readonly applyFailed: boolean;
  readonly canUndo: boolean;
  readonly replaceConfirmOpen: boolean;
  readonly undoConfirmOpen: boolean;
  readonly apply: (templateId: HotsiteTemplateId) => void;
  readonly retryApply: () => void;
  readonly confirmReplace: () => void;
  readonly cancelReplace: () => void;
  readonly undo: () => void;
  readonly confirmUndo: () => void;
  readonly cancelUndo: () => void;
  // Forgets the undo step (a successful Publish makes it moot).
  readonly clearUndo: () => void;
}

// A response can arrive after the manager kept editing, so a callback that runs later reads the
// latest draft through this ref, not the render in which it was created.
function useLatest(draft: HotsiteAdminContentResponse): DraftRef {
  const latest = useRef(draft);
  useLayoutEffect(() => {
    latest.current = draft;
  });
  return latest;
}

interface UndoStepArgs {
  readonly latestDraft: DraftRef;
  readonly setDraft: SetDraft;
  readonly onDraftChanged: () => void;
  readonly onUndone: () => void;
}

// The one-step undo: the presentation held just before the last successful apply. A new apply
// replaces the step (Undo goes back one apply, not several), and an edit made since the apply is
// confirmed before it is discarded.
function useUndoStep({ latestDraft, setDraft, onDraftChanged, onUndone }: UndoStepArgs) {
  const [snapshot, setSnapshot] = useState<TemplateUndoSnapshot | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const performUndo = (): void => {
    if (!snapshot) return;
    setDraft((current) => restoreUndoSnapshot(current, snapshot));
    setSnapshot(null);
    setConfirmOpen(false);
    onUndone();
    onDraftChanged();
  };
  const undo = (): void => {
    if (!snapshot) return;
    if (shouldConfirmUndo(latestDraft.current, snapshot)) setConfirmOpen(true);
    else performUndo();
  };

  return {
    record: (before: HotsiteAdminContentResponse, applied: HotsiteAdminContentResponse): void =>
      setSnapshot(undoSnapshotAfterApply(before, applied)),
    controls: {
      canUndo: snapshot !== null,
      undoConfirmOpen: confirmOpen,
      undo,
      confirmUndo: performUndo,
      cancelUndo: (): void => setConfirmOpen(false),
      clearUndo: useCallback((): void => setSnapshot(null), []),
    },
  };
}

interface ApplyFlowArgs {
  readonly latestDraft: DraftRef;
  readonly tenantId: string;
  readonly onApplied: (result: ApplyHotsiteTemplateResponse) => void;
}

// The apply request and the confirmation that precedes it. Applying is pure on the server, so a
// failed apply changes nothing on the client either.
function useApplyFlow({ latestDraft, tenantId, onApplied }: ApplyFlowArgs) {
  const mutation = useApplyHotsiteTemplate();
  const [pendingReplace, setPendingReplace] = useState<HotsiteTemplateId | null>(null);
  const [lastRequested, setLastRequested] = useState<HotsiteTemplateId | null>(null);

  const run = (templateId: HotsiteTemplateId): void => {
    setLastRequested(templateId);
    mutation.mutate(
      { templateId, body: buildApplyRequest(latestDraft.current, tenantId) },
      { onSuccess: onApplied },
    );
  };
  const apply = (templateId: HotsiteTemplateId): void => {
    if (mutation.isPending) return;
    // Replacing the manager's own uploads is the one apply they cannot take back after saving.
    if (countTenantImagesReplacedByTemplate(latestDraft.current.layout, tenantId) > 0) {
      setPendingReplace(templateId);
      return;
    }
    run(templateId);
  };

  return {
    isApplying: mutation.isPending,
    applyingTemplateId: mutation.isPending ? (mutation.variables?.templateId ?? null) : null,
    applyFailed: mutation.isError,
    replaceConfirmOpen: pendingReplace !== null,
    apply,
    retryApply: (): void => {
      if (lastRequested) run(lastRequested);
    },
    confirmReplace: (): void => {
      const templateId = pendingReplace;
      setPendingReplace(null);
      if (templateId) run(templateId);
    },
    cancelReplace: (): void => setPendingReplace(null),
  };
}

interface AppliedState {
  readonly id: HotsiteTemplateId;
  readonly sampleTestimonials: boolean;
}

interface AppliedHandlerDeps {
  readonly latestDraft: DraftRef;
  readonly setDraft: SetDraft;
  readonly onDraftChanged: () => void;
  readonly record: (
    before: HotsiteAdminContentResponse,
    applied: HotsiteAdminContentResponse,
  ) => void;
  readonly setApplied: (applied: AppliedState) => void;
}

// What a successful apply does: swap the presentation into the draft, remember the step to undo,
// and note which card (and whether sample testimonials) the session now has.
function createAppliedHandler(deps: AppliedHandlerDeps): (r: ApplyHotsiteTemplateResponse) => void {
  return (result) => {
    const before = deps.latestDraft.current;
    const next = applyTemplateResult(before, result);
    deps.record(before, next);
    deps.setApplied({
      id: result.appliedTemplate.id,
      sampleTestimonials: result.appliedSampleTestimonials,
    });
    deps.setDraft(() => next);
    deps.onDraftChanged();
  };
}

interface UseHotsiteTemplateApplicationArgs {
  readonly draft: HotsiteAdminContentResponse;
  readonly setDraft: SetDraft;
  readonly tenantId: string;
  // Called after the draft's presentation changed (an apply or an undo), to clear a stale banner.
  readonly onDraftChanged: () => void;
}

// The template picker's session state, owned by HotsiteEditor next to the draft it changes: the
// applied card, the one-step undo, the pending apply and the two confirmations.
export function useHotsiteTemplateApplication({
  draft,
  setDraft,
  tenantId,
  onDraftChanged,
}: UseHotsiteTemplateApplicationArgs): HotsiteTemplatesController {
  const catalogue = useHotsiteTemplates();
  const latestDraft = useLatest(draft);
  const [applied, setApplied] = useState<AppliedState | null>(null);
  const undoStep = useUndoStep({
    latestDraft,
    setDraft,
    onDraftChanged,
    onUndone: () => setApplied(null),
  });
  const flow = useApplyFlow({
    latestDraft,
    tenantId,
    onApplied: createAppliedHandler({
      latestDraft,
      setDraft,
      onDraftChanged,
      record: undoStep.record,
      setApplied,
    }),
  });

  return {
    templates: catalogue.data,
    isLoading: catalogue.isLoading,
    isError: catalogue.isError,
    reload: () => void catalogue.refetch(),
    appliedTemplateId: applied?.id ?? null,
    showSampleNotice: applied?.sampleTestimonials ?? false,
    ...flow,
    ...undoStep.controls,
  };
}
