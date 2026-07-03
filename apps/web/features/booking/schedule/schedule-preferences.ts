import { useMemo, useState } from 'react';
import {
  createBrowserPreferenceStore,
  type BrowserPreferenceStore,
} from '@/shared/lib/preferences/browser-storage';

export type ScheduleViewMode = 'day' | 'week';

interface SchedulePreferencesState {
  readonly viewMode: ScheduleViewMode | null;
  readonly setViewMode: (viewMode: ScheduleViewMode) => void;
}

interface SchedulePreferencesShape {
  viewMode?: ScheduleViewMode;
}

const SCHEDULE_PREFERENCES_NAMESPACE = 'schedule';
const VIEW_MODE_KEY = 'viewMode';

export function createSchedulePreferencesStore(
  storage: BrowserPreferenceStore = createBrowserPreferenceStore(SCHEDULE_PREFERENCES_NAMESPACE),
) {
  return {
    getViewMode(): ScheduleViewMode | null {
      return storage.get<SchedulePreferencesShape>(VIEW_MODE_KEY)?.viewMode ?? null;
    },
    setViewMode(viewMode: ScheduleViewMode): void {
      storage.set<SchedulePreferencesShape>(VIEW_MODE_KEY, { viewMode });
    },
    clearViewMode(): void {
      storage.remove(VIEW_MODE_KEY);
    },
  };
}

export function useSchedulePreferences(): SchedulePreferencesState {
  const store = useMemo(() => createSchedulePreferencesStore(), []);
  const [viewMode, setViewMode] = useState<ScheduleViewMode | null>(() => store.getViewMode());

  function updateViewMode(nextViewMode: ScheduleViewMode): void {
    setViewMode(nextViewMode);
    store.setViewMode(nextViewMode);
  }

  return { viewMode, setViewMode: updateViewMode };
}
