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
import { useTenant } from '@/providers/tenant-provider';

export type ScheduleViewMode = 'day' | 'week';

interface SchedulePreferencesState {
  readonly viewMode: ScheduleViewMode | null;
  readonly setViewMode: (viewMode: ScheduleViewMode) => void;
  readonly selectedStatuses: readonly BookingStatus[];
  readonly setSelectedStatuses: (
    selectedStatuses: SetStateAction<readonly BookingStatus[]>,
  ) => void;
  readonly selectedResourceIds: readonly string[];
  readonly setSelectedResourceIds: (selectedResourceIds: SetStateAction<readonly string[]>) => void;
}

interface SchedulePreferencesShape {
  viewMode?: ScheduleViewMode;
  selectedStatuses?: readonly BookingStatus[];
  selectedResourceIds?: readonly string[];
}

const SCHEDULE_PREFERENCES_NAMESPACE = 'schedule';
const VIEW_MODE_KEY = 'viewMode';
const SELECTED_STATUSES_KEY = 'selectedStatuses';
const SELECTED_RESOURCE_IDS_KEY = 'selectedResourceIds';
const PREFERENCES_CHANGED_EVENT = 'ikaro:schedule-preferences-changed';

function normalizeSelectedStatuses(
  selectedStatuses: readonly BookingStatus[] | undefined,
): readonly BookingStatus[] {
  if (!Array.isArray(selectedStatuses)) return SCHEDULE_BOOKING_STATUS_DEFAULT;

  const selected = new Set(selectedStatuses);
  return SCHEDULE_BOOKING_STATUS_OPTIONS.filter((status) => selected.has(status));
}

// Resources are tenant-specific and fetched dynamically (unlike the fixed BookingStatus enum
// above), so there's no fixed catalog to filter against here — just de-duplicate and drop
// anything that isn't a real id. A resource deleted/deactivated after being saved here simply
// won't be in the fetched resource list; ResourceFilterMenu already only renders checkboxes for
// currently-active resources, so a stale id has no visible effect.
function normalizeSelectedResourceIds(
  selectedResourceIds: readonly string[] | undefined,
): readonly string[] {
  if (!Array.isArray(selectedResourceIds)) return [];
  return [...new Set(selectedResourceIds.filter((id): id is string => typeof id === 'string'))];
}

// Extracted from createSchedulePreferencesStore below — the view-mode get/set/clear trio is a
// cohesive, self-contained slice of the persisted store.
function createViewModeStore(storage: BrowserPreferenceStore) {
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

// Extracted from createSchedulePreferencesStore below — the selected-statuses get/set/clear trio.
function createSelectedStatusesStore(storage: BrowserPreferenceStore) {
  return {
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

// Extracted from createSchedulePreferencesStore below — the selected-resource-ids get/set/clear
// trio, mirroring createSelectedStatusesStore's shape but with no fixed catalog to normalize
// against (see normalizeSelectedResourceIds above). Unlike BookingStatus (a fixed, tenant-agnostic
// enum), resource ids are tenant-specific — a multi-tenant staff user (CLAUDE.md §2 invariant 6)
// switching tenants must not carry tenant A's resource ids into tenant B's query, so the storage
// key itself is scoped by tenantId rather than shared across every tenant.
function createSelectedResourceIdsStore(storage: BrowserPreferenceStore, tenantId: string) {
  const key = `${SELECTED_RESOURCE_IDS_KEY}:${tenantId}`;
  return {
    getSelectedResourceIds(): readonly string[] {
      return normalizeSelectedResourceIds(
        storage.get<SchedulePreferencesShape>(key)?.selectedResourceIds,
      );
    },
    setSelectedResourceIds(selectedResourceIds: readonly string[]): void {
      const normalized = normalizeSelectedResourceIds(selectedResourceIds);
      if (normalized.length === 0) {
        storage.remove(key);
        return;
      }

      storage.set<SchedulePreferencesShape>(key, { selectedResourceIds: normalized });
    },
    clearSelectedResourceIds(): void {
      storage.remove(key);
    },
  };
}

export function createSchedulePreferencesStore(
  storage: BrowserPreferenceStore = createBrowserPreferenceStore(SCHEDULE_PREFERENCES_NAMESPACE),
  tenantId = '',
) {
  return {
    ...createViewModeStore(storage),
    ...createSelectedStatusesStore(storage),
    ...createSelectedResourceIdsStore(storage, tenantId),
  };
}

type SchedulePreferencesStore = ReturnType<typeof createSchedulePreferencesStore>;

function subscribeToPreferencesChanges(onStoreChange: () => void): () => void {
  globalThis.window?.addEventListener('storage', onStoreChange);
  globalThis.window?.addEventListener(PREFERENCES_CHANGED_EVENT, onStoreChange);
  return () => {
    globalThis.window?.removeEventListener('storage', onStoreChange);
    globalThis.window?.removeEventListener(PREFERENCES_CHANGED_EVENT, onStoreChange);
  };
}

function parseSelectedStatusesSnapshot(snapshot: string): readonly BookingStatus[] {
  try {
    const parsed = JSON.parse(snapshot) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeSelectedStatuses(parsed as readonly BookingStatus[]);
    }
  } catch {
    return SCHEDULE_BOOKING_STATUS_DEFAULT;
  }
  return SCHEDULE_BOOKING_STATUS_DEFAULT;
}

function parseSelectedResourceIdsSnapshot(snapshot: string): readonly string[] {
  try {
    const parsed = JSON.parse(snapshot) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeSelectedResourceIds(parsed as readonly string[]);
    }
  } catch {
    return [];
  }
  return [];
}

function dispatchPreferencesChanged(): void {
  globalThis.window?.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
}

// Extracted from useSchedulePreferences below — the view-mode read (synced from the persisted
// store) plus its updater are a cohesive, self-contained unit.
function useViewModePreference(store: SchedulePreferencesStore) {
  const viewMode = useSyncExternalStore(
    subscribeToPreferencesChanges,
    () => store.getViewMode(),
    () => null,
  );

  function setViewMode(nextViewMode: ScheduleViewMode): void {
    store.setViewMode(nextViewMode);
    dispatchPreferencesChanged();
  }

  return { viewMode, setViewMode };
}

// Extracted from useSchedulePreferences below — mirrors useViewModePreference's shape for the
// selected-statuses slice, including the functional-updater support setSelectedStatuses needs.
function useSelectedStatusesPreference(store: SchedulePreferencesStore) {
  const snapshot = useSyncExternalStore(
    subscribeToPreferencesChanges,
    () => JSON.stringify(store.getSelectedStatuses()),
    () => JSON.stringify(SCHEDULE_BOOKING_STATUS_DEFAULT),
  );
  const selectedStatuses = useMemo(() => parseSelectedStatusesSnapshot(snapshot), [snapshot]);

  function setSelectedStatuses(next: SetStateAction<readonly BookingStatus[]>): void {
    const resolved = typeof next === 'function' ? next(selectedStatuses) : next;
    store.setSelectedStatuses(resolved);
    dispatchPreferencesChanged();
  }

  return { selectedStatuses, setSelectedStatuses };
}

// Extracted from useSchedulePreferences below — mirrors useSelectedStatusesPreference's shape for
// the selected-resource-ids slice.
function useSelectedResourceIdsPreference(store: SchedulePreferencesStore) {
  const snapshot = useSyncExternalStore(
    subscribeToPreferencesChanges,
    () => JSON.stringify(store.getSelectedResourceIds()),
    () => JSON.stringify([]),
  );
  const selectedResourceIds = useMemo(() => parseSelectedResourceIdsSnapshot(snapshot), [snapshot]);

  function setSelectedResourceIds(next: SetStateAction<readonly string[]>): void {
    const resolved = typeof next === 'function' ? next(selectedResourceIds) : next;
    store.setSelectedResourceIds(resolved);
    dispatchPreferencesChanged();
  }

  return { selectedResourceIds, setSelectedResourceIds };
}

export function useSchedulePreferences(): SchedulePreferencesState {
  const { tenantId } = useTenant();
  const store = useMemo(() => createSchedulePreferencesStore(undefined, tenantId), [tenantId]);
  const { viewMode, setViewMode } = useViewModePreference(store);
  const { selectedStatuses, setSelectedStatuses } = useSelectedStatusesPreference(store);
  const { selectedResourceIds, setSelectedResourceIds } = useSelectedResourceIdsPreference(store);

  return {
    viewMode,
    setViewMode,
    selectedStatuses,
    setSelectedStatuses,
    selectedResourceIds,
    setSelectedResourceIds,
  };
}
