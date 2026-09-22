'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { HotsiteModuleType } from '@ikaro/types';

interface ModuleConfigPreviewState {
  readonly type: HotsiteModuleType;
  readonly localData: Record<string, unknown>;
}

type TranslateFn = (key: string) => string;
type SetOverrideFn<T> = ((value: T | null) => void) | undefined;

interface OverrideSetters {
  readonly setOnBackOverride: SetOverrideFn<() => void>;
  readonly setBackLabelOverride: SetOverrideFn<string>;
  readonly setPageTitleOverride: SetOverrideFn<string>;
}

function clearOverrides(setters: OverrideSetters): void {
  setters.setOnBackOverride?.(null);
  setters.setBackLabelOverride?.(null);
  setters.setPageTitleOverride?.(null);
}

function applyConfiguringTypeOverride(
  configuringType: HotsiteModuleType,
  t: TranslateFn,
  requestCancelConfigRef: RefObject<() => void>,
  setters: OverrideSetters,
): () => void {
  setters.setOnBackOverride?.(() => () => requestCancelConfigRef.current());
  setters.setBackLabelOverride?.(t('layout.configShell.backLabel'));
  const moduleLabel = t(`layout.modules.${configuringType}`);
  setters.setPageTitleOverride?.(`${t('layout.configShell.titlePrefix')}: ${moduleLabel}`);
  return () => clearOverrides(setters);
}

function applyPreviewOverride(
  onBackToTabs: () => void,
  t: TranslateFn,
  setters: OverrideSetters,
): () => void {
  setters.setOnBackOverride?.(() => onBackToTabs);
  setters.setBackLabelOverride?.(t('previewView.backLabel'));
  setters.setPageTitleOverride?.(t('previewView.pageTitle'));
  return () => clearOverrides(setters);
}

function applyModuleConfigPreviewOverride(
  moduleConfigPreview: ModuleConfigPreviewState,
  onBackToModuleConfigPreview: (state: ModuleConfigPreviewState) => void,
  t: TranslateFn,
  setters: OverrideSetters,
): () => void {
  const backToModuleConfig = () => onBackToModuleConfigPreview(moduleConfigPreview);
  setters.setOnBackOverride?.(() => backToModuleConfig);
  setters.setBackLabelOverride?.(t('previewView.backLabel'));
  setters.setPageTitleOverride?.(t('previewView.pageTitle'));
  return () => clearOverrides(setters);
}

interface UseHotsiteEditorTopbarOverrideParams {
  readonly configuringType: HotsiteModuleType | null;
  readonly isPreview: boolean;
  readonly moduleConfigPreview: ModuleConfigPreviewState | null;
  readonly onBackToModuleConfigPreview: (state: ModuleConfigPreviewState) => void;
  readonly onBackToTabs: () => void;
  readonly requestCancelConfig: () => void;
  readonly t: TranslateFn;
  readonly setOnBackOverride: SetOverrideFn<() => void>;
  readonly setBackLabelOverride: SetOverrideFn<string>;
  readonly setPageTitleOverride: SetOverrideFn<string>;
}

interface TopbarOverrideEffectState {
  readonly configuringType: HotsiteModuleType | null;
  readonly isPreview: boolean;
  readonly moduleConfigPreview: ModuleConfigPreviewState | null;
  readonly onBackToModuleConfigPreview: (state: ModuleConfigPreviewState) => void;
  readonly onBackToTabs: () => void;
  readonly t: TranslateFn;
}

function runTopbarOverrideEffect(
  state: TopbarOverrideEffectState,
  requestCancelConfigRef: RefObject<() => void>,
  setters: OverrideSetters,
): (() => void) | undefined {
  const {
    configuringType,
    isPreview,
    moduleConfigPreview,
    onBackToModuleConfigPreview,
    onBackToTabs,
    t,
  } = state;

  if (configuringType) {
    return applyConfiguringTypeOverride(configuringType, t, requestCancelConfigRef, setters);
  }
  if (isPreview) {
    return applyPreviewOverride(onBackToTabs, t, setters);
  }
  if (moduleConfigPreview) {
    return applyModuleConfigPreviewOverride(
      moduleConfigPreview,
      onBackToModuleConfigPreview,
      t,
      setters,
    );
  }
  return undefined;
}

// "Configurar" and "Preview" both fill the screen but aren't routes, so the shared dashboard
// Topbar's pathname-based back-link resolution doesn't apply — this pushes a callback override
// instead (same pattern BookingDetailPage/ServiceEditPage use for backHrefOverride, just with a
// function instead of a URL since there's nowhere to navigate to). Extracted from HotsiteEditor
// (TD37-S5A) — the two effects here are tightly coupled (the ref exists specifically to serve
// the topbar-wiring effect) and unrelated to draft/publish state.
export function useHotsiteEditorTopbarOverride(params: UseHotsiteEditorTopbarOverrideParams): void {
  // The `configuringType` branch below intentionally doesn't re-run this effect on every
  // keystroke (see the dependency array). But `requestCancelConfig` needs the *current*
  // `view.localData`/`draft` on every click, not whatever was there when the panel first
  // opened — so the override stored in topbar-status-context calls through this ref instead of
  // closing over `requestCancelConfig` directly. The ref is refreshed by the `useLayoutEffect`
  // below, so the effect's dependency array can stay unchanged while the invoked function
  // always reads fresh.
  const requestCancelConfigRef = useRef<() => void>(() => {});

  useEffect(
    () =>
      runTopbarOverrideEffect(
        {
          configuringType: params.configuringType,
          isPreview: params.isPreview,
          moduleConfigPreview: params.moduleConfigPreview,
          onBackToModuleConfigPreview: params.onBackToModuleConfigPreview,
          onBackToTabs: params.onBackToTabs,
          t: params.t,
        },
        requestCancelConfigRef,
        {
          setOnBackOverride: params.setOnBackOverride,
          setBackLabelOverride: params.setBackLabelOverride,
          setPageTitleOverride: params.setPageTitleOverride,
        },
      ),
    [
      params.configuringType,
      params.isPreview,
      params.moduleConfigPreview,
      params.onBackToModuleConfigPreview,
      params.onBackToTabs,
      params.setOnBackOverride,
      params.setBackLabelOverride,
      params.setPageTitleOverride,
      params.t,
    ],
  );

  // No dependency array — refreshes the ref after every render (not just when `configuringType`
  // changes), which is what lets the topbar override above always call the current, non-stale
  // version. A plain assignment during render is disallowed by the react-hooks/refs lint rule.
  // useLayoutEffect (not useEffect) so this ref is guaranteed to be refreshed before the
  // topbar-wiring effect above can run on the same commit, regardless of declaration order —
  // React flushes all of a component's layout effects before any of its passive effects.
  useLayoutEffect(() => {
    requestCancelConfigRef.current = params.requestCancelConfig;
  });
}
