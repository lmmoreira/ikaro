// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS } from '@ikaro/types';
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

  it('stores and restores the selected booking statuses', () => {
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

    expect(store.getSelectedStatuses()).toEqual([
      BOOKING_STATUS.INFO_REQUESTED,
      BOOKING_STATUS.APPROVED,
      BOOKING_STATUS.REJECTED,
      BOOKING_STATUS.CANCELLED,
      BOOKING_STATUS.COMPLETED,
    ]);

    store.setSelectedStatuses([
      BOOKING_STATUS.APPROVED,
      BOOKING_STATUS.PENDING,
      BOOKING_STATUS.APPROVED,
      BOOKING_STATUS.CANCELLED,
    ]);

    expect(store.getSelectedStatuses()).toEqual([
      BOOKING_STATUS.PENDING,
      BOOKING_STATUS.APPROVED,
      BOOKING_STATUS.CANCELLED,
    ]);
    expect(memory.get('selectedStatuses')).toEqual({
      selectedStatuses: [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.CANCELLED],
    });

    store.clearSelectedStatuses();
    expect(store.getSelectedStatuses()).toEqual([
      BOOKING_STATUS.INFO_REQUESTED,
      BOOKING_STATUS.APPROVED,
      BOOKING_STATUS.REJECTED,
      BOOKING_STATUS.CANCELLED,
      BOOKING_STATUS.COMPLETED,
    ]);
  });
});
