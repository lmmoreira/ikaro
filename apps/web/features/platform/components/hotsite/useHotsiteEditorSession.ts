'use client';

import { useCallback, useState } from 'react';
import type { HotsiteModuleType } from '@ikaro/types';
import type { EditorTab } from './HotsiteEditorMainView';
import type { EditorMode, EditorView, VisualContext } from './hotsite-editor-views';

type GlobalVisualContext = Exclude<VisualContext, { kind: 'module' }>['kind'];

export interface HotsiteEditorSession {
  readonly mode: EditorMode;
  // Detailed mode only: the tabbed editor, its Preview and its module-config drill-down.
  readonly view: EditorView;
  readonly activeTab: EditorTab;
  // Visual mode only; kept across a visual -> detailed -> visual round trip so the manager comes
  // back to the section they were looking at.
  readonly visualContext: VisualContext;
  readonly setView: (updater: EditorView | ((current: EditorView) => EditorView)) => void;
  readonly setActiveTab: (tab: EditorTab) => void;
  readonly enterDetailed: () => void;
  readonly backToVisual: () => void;
  readonly showGlobalContext: (kind: GlobalVisualContext) => void;
  readonly selectModule: (type: HotsiteModuleType, localData: Record<string, unknown>) => void;
}

// The editor's navigation state — which presentation (visual / detailed) is showing and where the
// manager is inside it. HotsiteEditor still owns the shared draft; this hook never touches it.
export function useHotsiteEditorSession(): HotsiteEditorSession {
  const [mode, setMode] = useState<EditorMode>('visual');
  const [view, setView] = useState<EditorView>({ view: 'tabs' });
  const [activeTab, setActiveTab] = useState<EditorTab>('branding');
  const [visualContext, setVisualContext] = useState<VisualContext>({ kind: 'structure' });

  const enterDetailed = useCallback(() => {
    setView({ view: 'tabs' });
    setMode('detailed');
  }, []);
  const backToVisual = useCallback(() => {
    setView({ view: 'tabs' });
    setMode('visual');
  }, []);
  const showGlobalContext = useCallback(
    (kind: GlobalVisualContext) => setVisualContext({ kind }),
    [],
  );
  const selectModule = useCallback(
    (type: HotsiteModuleType, localData: Record<string, unknown>) =>
      setVisualContext({ kind: 'module', type, localData }),
    [],
  );

  return {
    mode,
    view,
    activeTab,
    visualContext,
    setView,
    setActiveTab,
    enterDetailed,
    backToVisual,
    showGlobalContext,
    selectModule,
  };
}
