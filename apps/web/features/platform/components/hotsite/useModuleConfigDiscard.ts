'use client';

import { useState } from 'react';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import type { EditorView, LeadFormConfigDraft } from './hotsite-editor-views';
import { cancelModuleConfig } from './hotsite-module-buffer';

export interface ModuleConfigDiscard {
  readonly discardConfirmOpen: boolean;
  // Leaves the module-config screen at once when there is nothing to lose, otherwise opens the
  // discard confirmation — the actual discard happens in `confirmDiscard`.
  readonly requestCancel: () => void;
  readonly confirmDiscard: () => void;
  readonly keepEditing: () => void;
}

// The detailed editor's "Back" from a module's config screen: an unapplied edit is never dropped
// silently, only after the manager confirms.
export function useModuleConfigDiscard(
  view: EditorView,
  draft: HotsiteAdminContentResponse,
  leadFormConfigBaseline: LeadFormConfigDraft | null,
  setView: (view: EditorView) => void,
): ModuleConfigDiscard {
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const toTabs = (): void => setView({ view: 'tabs' });

  return {
    discardConfirmOpen,
    requestCancel: () =>
      cancelModuleConfig(
        view,
        draft,
        leadFormConfigBaseline,
        () => setDiscardConfirmOpen(true),
        toTabs,
      ),
    confirmDiscard: () => {
      setDiscardConfirmOpen(false);
      toTabs();
    },
    keepEditing: () => setDiscardConfirmOpen(false),
  };
}
