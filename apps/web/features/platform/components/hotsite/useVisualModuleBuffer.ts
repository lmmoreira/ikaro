'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { HotsiteAdminContentResponse, HotsiteModuleType } from '@ikaro/types';
import type { HotsiteEditorSession } from './useHotsiteEditorSession';
import type { ModuleInspectorActions } from './VisualModuleInspector';
import {
  buildModuleBuffer,
  type LeadFormConfigDraft,
  type VisualContext,
} from './hotsite-editor-views';
import {
  commitModuleBuffer,
  isModuleBufferDirty,
  type ModuleBuffer,
} from './hotsite-module-buffer';

type Navigation = Pick<
  HotsiteEditorSession,
  'selectModule' | 'showGlobalContext' | 'enterDetailed' | 'backToVisual' | 'updateModuleBuffer'
>;

interface UseVisualModuleBufferArgs {
  readonly visualContext: VisualContext;
  readonly draft: HotsiteAdminContentResponse;
  // The LeadFormConfig the editor currently holds for a LEAD_FORM: the session's unpublished draft
  // when there is one, else the one loaded from the server. A LEAD_FORM buffer starts from it, so
  // an untouched buffer already equals what the dirty check compares it against.
  readonly leadFormConfigBaseline: LeadFormConfigDraft | null;
  readonly navigation: Navigation;
  readonly onLayoutChange: (layout: HotsiteAdminContentResponse['layout']) => void;
  readonly onLeadFormConfig: (config: LeadFormConfigDraft) => void;
  readonly onCommit: (type: HotsiteModuleType, data: Record<string, unknown>) => void;
  readonly onClearBanner: () => void;
}

export interface VisualModuleBuffer {
  // The open module's local edit buffer; null outside a module context.
  readonly buffer: ModuleBuffer | null;
  readonly isDirty: boolean;
  readonly requestSelectModule: (type: HotsiteModuleType) => void;
  readonly requestStructure: () => void;
  readonly requestEditInDetail: () => void;
  readonly backToVisual: () => void;
  readonly apply: () => void;
  readonly discardConfirmOpen: boolean;
  readonly confirmDiscard: () => void;
  readonly keepEditing: () => void;
  // What the visual inspector needs, ready to hand to VisualHotsiteEditorView.
  readonly inspector: ModuleInspectorActions;
}

interface DiscardGuard {
  readonly park: (next: () => void) => void;
  readonly discardConfirmOpen: boolean;
  readonly confirmDiscard: () => void;
  readonly keepEditing: () => void;
}

// Parks a navigation behind the Apply-or-discard confirmation; it runs only once the manager
// confirms the discard, and is dropped if they keep editing.
function useDiscardGuard(): DiscardGuard {
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const park = (next: () => void): void => setPendingLeave(() => next);
  const confirmDiscard = (): void => {
    const next = pendingLeave;
    setPendingLeave(null);
    next?.();
  };
  return {
    park,
    discardConfirmOpen: pendingLeave !== null,
    confirmDiscard,
    keepEditing: () => setPendingLeave(null),
  };
}

// While the manager was in the detailed editor the draft may have changed under the retained
// buffer; reload it from the draft so a later Apply can never overwrite those edits. The result is
// a dependency of the topbar override effect, so it keeps one identity across renders and reads
// what it needs from the latest render through a ref.
function useBackToVisual(
  buffer: ModuleBuffer | null,
  draft: HotsiteAdminContentResponse,
  leadFormConfigBaseline: LeadFormConfigDraft | null,
  navigation: Navigation,
): () => void {
  const latest = useRef({ buffer, draft, leadFormConfigBaseline, navigation });
  useLayoutEffect(() => {
    latest.current = { buffer, draft, leadFormConfigBaseline, navigation };
  });
  return useCallback((): void => {
    const current = latest.current;
    current.navigation.backToVisual();
    if (!current.buffer) return;
    const { type } = current.buffer;
    current.navigation.selectModule(
      type,
      buildModuleBuffer(current.draft, type, current.leadFormConfigBaseline),
    );
  }, []);
}

// Commits the open buffer into the shared draft and returns to the structure list. An invalid
// LEAD_FORM buffer commits nothing and the module stays open.
function applyBuffer(buffer: ModuleBuffer | null, args: UseVisualModuleBufferArgs): void {
  if (!buffer) return;
  if (!commitModuleBuffer(buffer, args.onLeadFormConfig, args.onCommit)) return;
  args.onClearBanner();
  args.navigation.showGlobalContext('structure');
}

// Guards the visual editor's module buffer. Every way out of a dirty buffer — another section,
// the structure list, Edit in detail — is routed through one Apply-or-discard decision, so a
// previewed-but-unapplied edit is never silently lost. HotsiteEditor still owns the shared draft;
// this only decides when a navigation may proceed and commits the buffer on Apply.
export function useVisualModuleBuffer(args: UseVisualModuleBufferArgs): VisualModuleBuffer {
  const { visualContext, draft, leadFormConfigBaseline, navigation } = args;
  const buffer: ModuleBuffer | null =
    visualContext.kind === 'module'
      ? { type: visualContext.type, localData: visualContext.localData }
      : null;
  const isDirty = buffer ? isModuleBufferDirty(buffer, draft, leadFormConfigBaseline) : false;
  const guard = useDiscardGuard();
  const backToVisual = useBackToVisual(buffer, draft, leadFormConfigBaseline, navigation);

  // Runs `next` at once while there is nothing to lose, otherwise behind the confirmation.
  const leave = (next: () => void): void => (isDirty ? guard.park(next) : next());
  const requestStructure = (): void => leave(() => navigation.showGlobalContext('structure'));
  const requestSelectModule = (type: HotsiteModuleType): void => {
    if (buffer?.type === type) return;
    leave(() =>
      navigation.selectModule(type, buildModuleBuffer(draft, type, leadFormConfigBaseline)),
    );
  };
  const apply = (): void => applyBuffer(buffer, args);

  return {
    buffer,
    isDirty,
    requestSelectModule,
    requestStructure,
    requestEditInDetail: () => leave(navigation.enterDetailed),
    backToVisual,
    apply,
    discardConfirmOpen: guard.discardConfirmOpen,
    confirmDiscard: guard.confirmDiscard,
    keepEditing: guard.keepEditing,
    inspector: {
      discardConfirmOpen: guard.discardConfirmOpen,
      onLayoutChange: args.onLayoutChange,
      onBufferChange: navigation.updateModuleBuffer,
      onApply: apply,
      onLeaveModule: requestStructure,
      onConfirmDiscard: guard.confirmDiscard,
      onKeepEditing: guard.keepEditing,
    },
  };
}
