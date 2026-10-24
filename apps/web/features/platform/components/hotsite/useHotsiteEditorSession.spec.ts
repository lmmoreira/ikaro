// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHotsiteEditorSession } from './useHotsiteEditorSession';

describe('useHotsiteEditorSession', () => {
  it('starts in the visual editor on the structure context, with the tabbed view on Branding', () => {
    const { result } = renderHook(() => useHotsiteEditorSession());

    expect(result.current.mode).toBe('visual');
    expect(result.current.visualContext).toEqual({ kind: 'structure' });
    expect(result.current.view).toEqual({ view: 'tabs' });
    expect(result.current.activeTab).toBe('branding');
  });

  it('enters and leaves the detailed editor, always landing on its tabs', () => {
    const { result } = renderHook(() => useHotsiteEditorSession());

    act(() => result.current.setView({ view: 'preview' }));
    act(() => result.current.enterDetailed());
    expect(result.current.mode).toBe('detailed');
    expect(result.current.view).toEqual({ view: 'tabs' });

    act(() => result.current.setView({ view: 'preview' }));
    act(() => result.current.backToVisual());
    expect(result.current.mode).toBe('visual');
    expect(result.current.view).toEqual({ view: 'tabs' });
  });

  it('keeps the visual context and the active tab across a visual -> detailed -> visual round trip', () => {
    const { result } = renderHook(() => useHotsiteEditorSession());
    act(() => result.current.selectModule('CONTACT', { title: 'Fale conosco' }));
    act(() => result.current.setActiveTab('seo'));

    act(() => result.current.enterDetailed());
    act(() => result.current.backToVisual());

    expect(result.current.visualContext).toEqual({
      kind: 'module',
      type: 'CONTACT',
      localData: { title: 'Fale conosco' },
    });
    act(() => result.current.enterDetailed());
    expect(result.current.activeTab).toBe('seo');
  });

  it('never has a module context without its buffer', () => {
    const { result } = renderHook(() => useHotsiteEditorSession());

    act(() => result.current.selectModule('HERO', {}));

    const context = result.current.visualContext;
    expect(context.kind).toBe('module');
    if (context.kind === 'module') {
      expect(context.type).toBe('HERO');
      expect(context.localData).toEqual({});
    }
  });

  it.each(['structure', 'branding', 'sharing', 'templates'] as const)(
    'switching to the %s context drops the module buffer',
    (kind) => {
      const { result } = renderHook(() => useHotsiteEditorSession());
      act(() => result.current.selectModule('HERO', { title: 'x' }));

      act(() => result.current.showGlobalContext(kind));

      expect(result.current.visualContext).toEqual({ kind });
    },
  );

  it('replaces the selected module when another one is selected', () => {
    const { result } = renderHook(() => useHotsiteEditorSession());
    act(() => result.current.selectModule('HERO', { title: 'a' }));

    act(() => result.current.selectModule('ABOUT', { title: 'b' }));

    expect(result.current.visualContext).toEqual({
      kind: 'module',
      type: 'ABOUT',
      localData: { title: 'b' },
    });
  });

  it('replaces the open module buffer as the manager edits, keeping the module', () => {
    const { result } = renderHook(() => useHotsiteEditorSession());
    act(() => result.current.selectModule('CONTACT', { title: 'a' }));

    act(() => result.current.updateModuleBuffer({ title: 'ab' }));

    expect(result.current.visualContext).toEqual({
      kind: 'module',
      type: 'CONTACT',
      localData: { title: 'ab' },
    });
  });

  it.each(['structure', 'branding', 'sharing', 'templates'] as const)(
    'ignores a buffer update in the %s context, so no module context appears without a module',
    (kind) => {
      const { result } = renderHook(() => useHotsiteEditorSession());
      act(() => result.current.showGlobalContext(kind));

      act(() => result.current.updateModuleBuffer({ title: 'x' }));

      expect(result.current.visualContext).toEqual({ kind });
    },
  );
});
