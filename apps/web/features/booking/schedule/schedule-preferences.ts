import { useMemo, useSyncExternalStore, type SetStateAction } from 'react';
import type { BookingStatus } from '@ikaro/types';
import {
  createBrowserPreferenceStore,
  type BrowserPreferenceStore,
} from '@/shared/lib/preferences/browser-storage';
import {
  SCHEDULE_BOOKING_STATUS_DEFAULT,
  SCHEDULE_BOOKING_STATUS_OPTIONS,
} from '@/features/booking/model/booking-status';

export type ScheduleViewMode = 'day' | 'week';

interface SchedulePreferencesState {
  readonly viewMode: ScheduleViewMode | null;
  readonly setViewMode: (viewMode: ScheduleViewMode) => void;
  readonly selectedStatuses: readonly BookingStatus[];
  readonly setSelectedStatuses: (
    selectedStatuses: SetStateAction<readonly BookingStatus[]>,
  ) => void;
}

interface SchedulePreferencesShape {
  viewMode?: ScheduleViewMode;
  selectedStatuses?: readonly BookingStatus[];
}

const SCHEDULE_PREFERENCES_NAMESPACE = 'schedule';
const VIEW_MODE_KEY = 'viewMode';
const SELECTED_STATUSES_KEY = 'selectedStatuses';
const PREFERENCES_CHANGED_EVENT = 'ikaro:schedule-preferences-changed';

function normalizeSelectedStatuses(
  selectedStatuses: readonly BookingStatus[] | undefined,
): readonly BookingStatus[] {
  if (!Array.isArray(selectedStatuses)) return SCHEDULE_BOOKING_STATUS_DEFAULT;

  const selected = new Set(selectedStatuses);
  return SCHEDULE_BOOKING_STATUS_OPTIONS.filter((status) => selected.has(status));
}

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
    getSelectedStatuses(): readonly BookingStatus[] {
      return normalizeSelectedStatuses(
        storage.get<SchedulePreferencesShape>(SELECTED_STATUSES_KEY)?.selectedStatuses,
      );
    },
    setSelectedStatuses(selectedStatuses: readonly BookingStatus[]): void {
      const normalized = normalizeSelectedStatuses(selectedStatuses);
      if (
        normalized.length === SCHEDULE_BOOKING_STATUS_DEFAULT.length &&
        normalized.every((status, index) => status === SCHEDULE_BOOKING_STATUS_DEFAULT[index])
      ) {
        storage.remove(SELECTED_STATUSES_KEY);
        return;
      }

      storage.set<SchedulePreferencesShape>(SELECTED_STATUSES_KEY, {
        selectedStatuses: normalized,
      });
    },
    clearSelectedStatuses(): void {
      storage.remove(SELECTED_STATUSES_KEY);
    },
  };
}

export function useSchedulePreferences(): SchedulePreferencesState {
  const store = useMemo(() => createSchedulePreferencesStore(), []);
  const viewMode = useSyncExternalStore(
    (onStoreChange) => {
      globalThis.window?.addEventListener('storage', onStoreChange);
      globalThis.window?.addEventListener(PREFERENCES_CHANGED_EVENT, onStoreChange);
      return () => {
        globalThis.window?.removeEventListener('storage', onStoreChange);
        globalThis.window?.removeEventListener(PREFERENCES_CHANGED_EVENT, onStoreChange);
      };
    },
    () => store.getViewMode(),
    () => null,
  );
  const selectedStatusesSnapshot = useSyncExternalStore(
    (onStoreChange) => {
      globalThis.window?.addEventListener('storage', onStoreChange);
      globalThis.window?.addEventListener(PREFERENCES_CHANGED_EVENT, onStoreChange);
      return () => {
        globalThis.window?.removeEventListener('storage', onStoreChange);
        globalThis.window?.removeEventListener(PREFERENCES_CHANGED_EVENT, onStoreChange);
      };
    },
    () => JSON.stringify(store.getSelectedStatuses()),
    () => JSON.stringify(SCHEDULE_BOOKING_STATUS_DEFAULT),
  );
  const selectedStatuses = useMemo(() => {
    try {
      const parsed = JSON.parse(selectedStatusesSnapshot) as unknown;
      if (Array.isArray(parsed)) {
        return normalizeSelectedStatuses(parsed as readonly BookingStatus[]);
      }
    } catch {
      return SCHEDULE_BOOKING_STATUS_DEFAULT;
    }

    return SCHEDULE_BOOKING_STATUS_DEFAULT;
  }, [selectedStatusesSnapshot]);

  function updateViewMode(nextViewMode: ScheduleViewMode): void {
    store.setViewMode(nextViewMode);
    globalThis.window?.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
  }

  function updateSelectedStatuses(
    nextSelectedStatuses: SetStateAction<readonly BookingStatus[]>,
  ): void {
    const resolvedSelectedStatuses =
      typeof nextSelectedStatuses === 'function'
        ? nextSelectedStatuses(selectedStatuses)
        : nextSelectedStatuses;

    store.setSelectedStatuses(resolvedSelectedStatuses);
    globalThis.window?.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
  }

  return {
    viewMode,
    setViewMode: updateViewMode,
    selectedStatuses,
    setSelectedStatuses: updateSelectedStatuses,
  };
}
