// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserPreferenceStore } from '@/shared/lib/preferences/browser-storage';
import {
  createAgendaPreferencesStore,
  normalizeHiddenOptions,
  useAgendaPreferences,
} from './agenda-preferences';

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

describe('normalizeHiddenOptions', () => {
  it('keeps the catalog order, drops unknown and repeated entries', () => {
    expect(normalizeHiddenOptions(['upcoming', 'nope', 'bookings', 'upcoming'])).toEqual([
      'bookings',
      'upcoming',
    ]);
  });

  it('treats anything that is not an array as nothing hidden', () => {
    expect(normalizeHiddenOptions(undefined)).toEqual([]);
    expect(normalizeHiddenOptions(null)).toEqual([]);
    expect(normalizeHiddenOptions('today' as unknown as string[])).toEqual([]);
  });
});

describe('createAgendaPreferencesStore', () => {
  it('starts with nothing hidden', () => {
    expect(createAgendaPreferencesStore(memoryStorage(), 't-1').getHiddenOptions()).toEqual([]);
  });

  it('stores and restores what the user hid', () => {
    const store = createAgendaPreferencesStore(memoryStorage(), 't-1');

    store.setHiddenOptions(['recurrences', 'today']);

    expect(store.getHiddenOptions()).toEqual(['recurrences', 'today']);
  });

  it('removes the entry when everything is visible again, so "Padrão" leaves nothing stored', () => {
    const storage = memoryStorage();
    const store = createAgendaPreferencesStore(storage, 't-1');
    store.setHiddenOptions(['today']);
    expect(storage.memory.size).toBe(1);

    store.setHiddenOptions([]);

    expect(storage.memory.size).toBe(0);
  });

  it("keeps one tenant's choice out of another tenant's Agenda", () => {
    const storage = memoryStorage();
    createAgendaPreferencesStore(storage, 't-1').setHiddenOptions(['bookings']);

    expect(createAgendaPreferencesStore(storage, 't-2').getHiddenOptions()).toEqual([]);
    expect(createAgendaPreferencesStore(storage, 't-1').getHiddenOptions()).toEqual(['bookings']);
  });

  it('clears the stored choice', () => {
    const store = createAgendaPreferencesStore(memoryStorage(), 't-1');
    store.setHiddenOptions(['upcoming']);

    store.clearHiddenOptions();

    expect(store.getHiddenOptions()).toEqual([]);
  });
});

describe('useAgendaPreferences', () => {
  it('shows everything by default and persists a change across a remount', () => {
    const first = renderHook(() => useAgendaPreferences());
    expect(first.result.current.hiddenOptions).toEqual([]);

    act(() => first.result.current.setHiddenOptions(['recurrences']));
    expect(first.result.current.hiddenOptions).toEqual(['recurrences']);
    first.unmount();

    const second = renderHook(() => useAgendaPreferences());
    expect(second.result.current.hiddenOptions).toEqual(['recurrences']);
  });

  it('accepts a functional update', () => {
    const { result } = renderHook(() => useAgendaPreferences());

    act(() => result.current.setHiddenOptions((current) => [...current, 'today']));
    act(() => result.current.setHiddenOptions((current) => [...current, 'upcoming']));

    expect(result.current.hiddenOptions).toEqual(['today', 'upcoming']);
  });

  it('survives corrupted storage by showing everything', () => {
    globalThis.window.localStorage.setItem('agenda', '{not json');

    const { result } = renderHook(() => useAgendaPreferences());

    expect(result.current.hiddenOptions).toEqual([]);
  });

  it('keeps tenants apart', () => {
    const { result, rerender } = renderHook(() => useAgendaPreferences());
    act(() => result.current.setHiddenOptions(['bookings']));

    tenant.tenantId = 't-2';
    rerender();

    expect(result.current.hiddenOptions).toEqual([]);
  });
});
