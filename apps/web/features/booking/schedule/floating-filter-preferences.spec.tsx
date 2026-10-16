// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserPreferenceStore } from '@/shared/lib/preferences/browser-storage';
import {
  createFloatingFilterPreferencesStore,
  normalizeCorner,
  useFloatingFilterCorner,
} from './floating-filter-preferences';

const tenant = { tenantId: 't-1' };
vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => tenant,
}));

function memoryStorage(): BrowserPreferenceStore & { readonly memory: Map<string, unknown> } {
  const memory = new Map<string, unknown>();
  return {
    memory,
    get<T>(key: string): T | null {
      return memory.has(key) ? (memory.get(key) as T) : null;
    },
    set<T>(key: string, value: T): void {
      memory.set(key, value);
    },
    remove(key: string): void {
      memory.delete(key);
    },
  };
}

beforeEach(() => {
  globalThis.window.localStorage.clear();
  tenant.tenantId = 't-1';
});

describe('normalizeCorner', () => {
  it('keeps a known corner and falls back to bottom-right for anything else', () => {
    expect(normalizeCorner('top-left')).toBe('top-left');
    expect(normalizeCorner('middle')).toBe('bottom-right');
    expect(normalizeCorner(undefined)).toBe('bottom-right');
    expect(normalizeCorner(42)).toBe('bottom-right');
  });
});

describe('createFloatingFilterPreferencesStore', () => {
  it('stores and restores a corner', () => {
    const store = createFloatingFilterPreferencesStore('agenda', memoryStorage(), 't-1');

    store.setCorner('top-right');

    expect(store.getCorner()).toBe('top-right');
  });

  it('starts at the default corner when nothing was stored', () => {
    expect(createFloatingFilterPreferencesStore('agenda', memoryStorage(), 't-1').getCorner()).toBe(
      'bottom-right',
    );
  });

  it("never lets one tenant's corner reach another tenant", () => {
    const storage = memoryStorage();
    createFloatingFilterPreferencesStore('agenda', storage, 't-a').setCorner('top-left');

    expect(createFloatingFilterPreferencesStore('agenda', storage, 't-b').getCorner()).toBe(
      'bottom-right',
    );
    expect(createFloatingFilterPreferencesStore('agenda', storage, 't-a').getCorner()).toBe(
      'top-left',
    );
  });

  it('keeps the Agenda and Horários corners apart', () => {
    const storage = memoryStorage();
    createFloatingFilterPreferencesStore('agenda', storage, 't-1').setCorner('top-left');

    expect(createFloatingFilterPreferencesStore('schedule', storage, 't-1').getCorner()).toBe(
      'bottom-right',
    );
  });

  it('removes the key instead of storing the default corner', () => {
    const storage = memoryStorage();
    const store = createFloatingFilterPreferencesStore('agenda', storage, 't-1');
    store.setCorner('top-left');

    store.setCorner('bottom-right');

    expect(storage.memory.size).toBe(0);
    expect(store.getCorner()).toBe('bottom-right');
  });

  it('falls back to the default for a stored value it does not know', () => {
    const storage = memoryStorage();
    storage.set('corner:t-1:agenda', { corner: 'left-ish' });

    expect(createFloatingFilterPreferencesStore('agenda', storage, 't-1').getCorner()).toBe(
      'bottom-right',
    );
  });

  it('falls back to the default when the browser storage is unavailable', () => {
    const unavailable: BrowserPreferenceStore = {
      get: () => null,
      set: () => undefined,
      remove: () => undefined,
    };
    const store = createFloatingFilterPreferencesStore('agenda', unavailable, 't-1');

    store.setCorner('top-left');

    expect(store.getCorner()).toBe('bottom-right');
  });
});

describe('useFloatingFilterCorner', () => {
  it('starts at the default, remembers the choice across a remount and writes it to localStorage', () => {
    const first = renderHook(() => useFloatingFilterCorner('agenda'));
    expect(first.result.current.corner).toBe('bottom-right');

    act(() => first.result.current.setCorner('top-right'));
    expect(first.result.current.corner).toBe('top-right');
    first.unmount();

    const second = renderHook(() => useFloatingFilterCorner('agenda'));
    expect(second.result.current.corner).toBe('top-right');
  });

  it('gives a different tenant the default corner', () => {
    const first = renderHook(() => useFloatingFilterCorner('agenda'));
    act(() => first.result.current.setCorner('top-right'));
    first.unmount();

    tenant.tenantId = 't-2';
    const other = renderHook(() => useFloatingFilterCorner('agenda'));

    expect(other.result.current.corner).toBe('bottom-right');
  });

  it('keeps two hooks for the same page in step through the change event', () => {
    const a = renderHook(() => useFloatingFilterCorner('schedule'));
    const b = renderHook(() => useFloatingFilterCorner('schedule'));

    act(() => a.result.current.setCorner('bottom-left'));

    expect(b.result.current.corner).toBe('bottom-left');
  });
});
