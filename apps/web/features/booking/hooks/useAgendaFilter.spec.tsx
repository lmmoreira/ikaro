// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgendaFilter } from './useAgendaFilter';

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({ tenantId: 't-1' }),
}));

beforeEach(() => {
  globalThis.window.localStorage.clear();
});

describe('useAgendaFilter', () => {
  it('starts with every block visible and the popover closed', () => {
    const { result } = renderHook(() => useAgendaFilter());

    expect(result.current.hiddenOptions.size).toBe(0);
    expect(result.current.allHidden).toBe(false);
    expect(result.current.menuOpen).toBe(false);
    for (const option of ['bookings', 'recurrences', 'today', 'upcoming'] as const) {
      expect(result.current.isVisible(option)).toBe(true);
    }
  });

  it('hides a block and shows it again', () => {
    const { result } = renderHook(() => useAgendaFilter());

    act(() => result.current.toggleOption('recurrences'));
    expect(result.current.isVisible('recurrences')).toBe(false);
    expect(result.current.isVisible('bookings')).toBe(true);

    act(() => result.current.toggleOption('recurrences'));
    expect(result.current.isVisible('recurrences')).toBe(true);
  });

  it('reports everything hidden only when all four blocks are', () => {
    const { result } = renderHook(() => useAgendaFilter());

    act(() => result.current.toggleOption('bookings'));
    act(() => result.current.toggleOption('recurrences'));
    act(() => result.current.toggleOption('today'));
    expect(result.current.allHidden).toBe(false);

    act(() => result.current.toggleOption('upcoming'));
    expect(result.current.allHidden).toBe(true);
  });

  it('"Padrão" shows every block again', () => {
    const { result } = renderHook(() => useAgendaFilter());
    act(() => result.current.toggleOption('today'));
    act(() => result.current.toggleOption('upcoming'));

    act(() => result.current.reset());

    expect(result.current.hiddenOptions.size).toBe(0);
  });

  it('keeps the choice after a remount (it is persisted)', () => {
    const first = renderHook(() => useAgendaFilter());
    act(() => first.result.current.toggleOption('recurrences'));
    first.unmount();

    const second = renderHook(() => useAgendaFilter());

    expect(second.result.current.isVisible('recurrences')).toBe(false);
  });

  it('opens, toggles and closes the popover', () => {
    const { result } = renderHook(() => useAgendaFilter());

    act(() => result.current.toggleMenu());
    expect(result.current.menuOpen).toBe(true);

    act(() => result.current.toggleMenu());
    expect(result.current.menuOpen).toBe(false);

    act(() => result.current.toggleMenu());
    act(() => result.current.closeMenu());
    expect(result.current.menuOpen).toBe(false);
  });

  it('closes the popover on Escape', () => {
    const { result } = renderHook(() => useAgendaFilter());
    act(() => result.current.toggleMenu());

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(result.current.menuOpen).toBe(false);
  });
});
