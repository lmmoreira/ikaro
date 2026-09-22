// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useHotsiteEditorTopbarOverride } from './useHotsiteEditorTopbarOverride';

type Params = Parameters<typeof useHotsiteEditorTopbarOverride>[0];

function baseParams(overrides: Partial<Params> = {}): Params {
  return {
    configuringType: null,
    isPreview: false,
    moduleConfigPreview: null,
    onBackToModuleConfigPreview: vi.fn(),
    onBackToTabs: vi.fn(),
    requestCancelConfig: vi.fn(),
    t: (key: string) => key,
    setOnBackOverride: vi.fn(),
    setBackLabelOverride: vi.fn(),
    setPageTitleOverride: vi.fn(),
    ...overrides,
  };
}

function lastOnBackOverride(params: Params): () => void {
  const setOnBackOverride = params.setOnBackOverride as ReturnType<typeof vi.fn>;
  const lastCall = setOnBackOverride.mock.calls.at(-1);
  return (lastCall![0] as () => () => void)();
}

describe('useHotsiteEditorTopbarOverride', () => {
  it('applies no override when none of configuringType/isPreview/moduleConfigPreview are active', () => {
    const params = baseParams();
    renderHook(() => useHotsiteEditorTopbarOverride(params));
    expect(params.setOnBackOverride).not.toHaveBeenCalled();
    expect(params.setBackLabelOverride).not.toHaveBeenCalled();
    expect(params.setPageTitleOverride).not.toHaveBeenCalled();
  });

  it('applies the configuring-type override, with the back handler calling through to requestCancelConfig', () => {
    const requestCancelConfig = vi.fn();
    const params = baseParams({ configuringType: 'HERO', requestCancelConfig });
    renderHook(() => useHotsiteEditorTopbarOverride(params));

    expect(params.setBackLabelOverride).toHaveBeenCalledWith('layout.configShell.backLabel');
    expect(params.setPageTitleOverride).toHaveBeenCalledWith(
      'layout.configShell.titlePrefix: layout.modules.HERO',
    );

    lastOnBackOverride(params)();
    expect(requestCancelConfig).toHaveBeenCalledTimes(1);
  });

  it('the back-override always calls the CURRENT requestCancelConfig, not a stale closure from mount', () => {
    const firstRequestCancelConfig = vi.fn();
    const secondRequestCancelConfig = vi.fn();
    const params = baseParams({
      configuringType: 'HERO',
      requestCancelConfig: firstRequestCancelConfig,
    });
    const { rerender } = renderHook((p: Params) => useHotsiteEditorTopbarOverride(p), {
      initialProps: params,
    });

    const onBack = lastOnBackOverride(params);

    rerender({ ...params, requestCancelConfig: secondRequestCancelConfig });
    onBack();

    expect(firstRequestCancelConfig).not.toHaveBeenCalled();
    expect(secondRequestCancelConfig).toHaveBeenCalledTimes(1);
  });

  it('applies the preview override with onBackToTabs as the back handler', () => {
    const onBackToTabs = vi.fn();
    const params = baseParams({ isPreview: true, onBackToTabs });
    renderHook(() => useHotsiteEditorTopbarOverride(params));

    expect(params.setBackLabelOverride).toHaveBeenCalledWith('previewView.backLabel');
    expect(params.setPageTitleOverride).toHaveBeenCalledWith('previewView.pageTitle');

    lastOnBackOverride(params)();
    expect(onBackToTabs).toHaveBeenCalledTimes(1);
  });

  it('applies the module-config-preview override, routing back through onBackToModuleConfigPreview with the preview state', () => {
    const onBackToModuleConfigPreview = vi.fn();
    const moduleConfigPreview = { type: 'HERO' as const, localData: { title: 'x' } };
    const params = baseParams({ moduleConfigPreview, onBackToModuleConfigPreview });
    renderHook(() => useHotsiteEditorTopbarOverride(params));

    lastOnBackOverride(params)();
    expect(onBackToModuleConfigPreview).toHaveBeenCalledWith(moduleConfigPreview);
  });

  it('configuringType takes priority over isPreview and moduleConfigPreview when multiple are set', () => {
    const params = baseParams({
      configuringType: 'HERO',
      isPreview: true,
      moduleConfigPreview: { type: 'HERO', localData: {} },
    });
    renderHook(() => useHotsiteEditorTopbarOverride(params));
    expect(params.setBackLabelOverride).toHaveBeenCalledWith('layout.configShell.backLabel');
  });

  it('clears every override on unmount', () => {
    const params = baseParams({ configuringType: 'HERO' });
    const { unmount } = renderHook(() => useHotsiteEditorTopbarOverride(params));
    vi.mocked(params.setOnBackOverride!).mockClear();
    vi.mocked(params.setBackLabelOverride!).mockClear();
    vi.mocked(params.setPageTitleOverride!).mockClear();

    unmount();

    expect(params.setOnBackOverride).toHaveBeenCalledWith(null);
    expect(params.setBackLabelOverride).toHaveBeenCalledWith(null);
    expect(params.setPageTitleOverride).toHaveBeenCalledWith(null);
  });

  // Regression test for the PR's headline bug fix: a caller that passes STABLE (memoized)
  // onBackToModuleConfigPreview/onBackToTabs references, plus every other dependency stable
  // across re-renders, must NOT retrigger the topbar-override effect on every render — this is
  // exactly the infinite-render-loop class of bug this hook's own effect dependency array exists
  // to guard against (TD37-S5A: HotsiteEditor.tsx originally passed brand-new inline arrow
  // functions into this hook on every render, causing exactly this).
  it('does not re-apply the override on a re-render when every dependency is referentially stable', () => {
    const params = baseParams({ configuringType: 'HERO' });
    const { rerender } = renderHook((p: Params) => useHotsiteEditorTopbarOverride(p), {
      initialProps: params,
    });
    expect(params.setOnBackOverride).toHaveBeenCalledTimes(1);

    rerender({ ...params });
    rerender({ ...params });
    rerender({ ...params });

    expect(params.setOnBackOverride).toHaveBeenCalledTimes(1);
  });

  it('DOES re-apply the override when a dependency changes to a new reference (sanity check the effect is reactive at all)', () => {
    const params = baseParams({ configuringType: 'HERO' });
    const { rerender } = renderHook((p: Params) => useHotsiteEditorTopbarOverride(p), {
      initialProps: params,
    });
    expect(params.setOnBackOverride).toHaveBeenCalledTimes(1);

    rerender({ ...params, onBackToTabs: vi.fn() });

    // A genuine re-trigger runs the previous effect's cleanup (setOnBackOverride(null)) before
    // reapplying (setOnBackOverride(fn)) — 1 initial + 1 cleanup + 1 reapply = 3 calls total,
    // with the last call being a real function again (not the cleanup's null).
    expect(params.setOnBackOverride).toHaveBeenCalledTimes(3);
    const setOnBackOverride = params.setOnBackOverride as ReturnType<typeof vi.fn>;
    expect(setOnBackOverride.mock.calls.at(-1)?.[0]).toBeInstanceOf(Function);
  });
});
