// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSchedulePreferencesStore } from './schedule-preferences';

describe('schedule preferences', () => {
  it('stores and reads the schedule view mode', () => {
    const memory = new Map<string, unknown>();
    const store = createSchedulePreferencesStore({
      get: (key) => (memory.has(key) ? (memory.get(key) as { viewMode?: 'day' | 'week' }) : null),
      set: (key, value) => memory.set(key, value),
      remove: (key) => memory.delete(key),
    });

    expect(store.getViewMode()).toBeNull();

    store.setViewMode('week');

    expect(store.getViewMode()).toBe('week');
    store.clearViewMode();
    expect(store.getViewMode()).toBeNull();
  });
});
