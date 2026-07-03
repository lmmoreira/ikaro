// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { BrowserPreferenceStore } from '@/shared/lib/preferences/browser-storage';
import { createSchedulePreferencesStore } from './schedule-preferences';

describe('schedule preferences', () => {
  it('stores and reads the schedule view mode', () => {
    const memory = new Map<string, unknown>();
    const storage = {
      get<T>(key: string): T | null {
        return memory.has(key) ? (memory.get(key) as T) : null;
      },
      set<T>(key: string, value: T): void {
        memory.set(key, value);
      },
      remove(key: string): void {
        memory.delete(key);
      },
    } satisfies BrowserPreferenceStore;
    const store = createSchedulePreferencesStore(storage);

    expect(store.getViewMode()).toBeNull();

    store.setViewMode('week');

    expect(store.getViewMode()).toBe('week');
    store.clearViewMode();
    expect(store.getViewMode()).toBeNull();
  });
});
