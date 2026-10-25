// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import type { EditorView } from './hotsite-editor-views';
import { useModuleConfigDiscard } from './useModuleConfigDiscard';

const ABOUT = { title: 'T', body: 'B', imagePosition: 'left' };
const DRAFT = {
  branding: {},
  layout: [{ type: 'ABOUT', enabled: true, data: ABOUT }],
  seo: {},
  updatedAt: '2026-10-24T00:00:00.000Z',
  isPublished: false,
} as unknown as HotsiteAdminContentResponse;

function viewWith(localData: Record<string, unknown>): EditorView {
  return { view: 'module-config', type: 'ABOUT', localData };
}

describe('useModuleConfigDiscard', () => {
  it('goes back to the tabs at once when nothing was edited', () => {
    const setView = vi.fn();
    const { result } = renderHook(() =>
      useModuleConfigDiscard(viewWith(ABOUT), DRAFT, null, setView),
    );

    act(() => result.current.requestCancel());

    expect(setView).toHaveBeenCalledWith({ view: 'tabs' });
    expect(result.current.discardConfirmOpen).toBe(false);
  });

  // Negative guarantee: an unapplied edit is never dropped without asking.
  it('asks first when there is an unapplied edit, and leaves only once confirmed', () => {
    const setView = vi.fn();
    const { result } = renderHook(() =>
      useModuleConfigDiscard(viewWith({ ...ABOUT, title: 'Changed' }), DRAFT, null, setView),
    );

    act(() => result.current.requestCancel());
    expect(result.current.discardConfirmOpen).toBe(true);
    expect(setView).not.toHaveBeenCalled();

    act(() => result.current.confirmDiscard());
    expect(setView).toHaveBeenCalledWith({ view: 'tabs' });
    expect(result.current.discardConfirmOpen).toBe(false);
  });

  it('keeps editing: closes the confirmation and stays', () => {
    const setView = vi.fn();
    const { result } = renderHook(() =>
      useModuleConfigDiscard(viewWith({ ...ABOUT, title: 'Changed' }), DRAFT, null, setView),
    );

    act(() => result.current.requestCancel());
    act(() => result.current.keepEditing());

    expect(result.current.discardConfirmOpen).toBe(false);
    expect(setView).not.toHaveBeenCalled();
  });

  it('counts a presentation-only edit as unapplied', () => {
    const setView = vi.fn();
    const { result } = renderHook(() =>
      useModuleConfigDiscard(
        viewWith({ ...ABOUT, presentation: { surface: 'primary' } }),
        DRAFT,
        null,
        setView,
      ),
    );

    act(() => result.current.requestCancel());

    expect(result.current.discardConfirmOpen).toBe(true);
  });
});
