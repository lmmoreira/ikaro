import { useMemo, useSyncExternalStore, type SetStateAction } from 'react';
import {
  createBrowserPreferenceStore,
  type BrowserPreferenceStore,
} from '@/shared/lib/preferences/browser-storage';
import { useTenant } from '@/providers/tenant-provider';

// The four things the Agenda's "Filtrar agenda" balloon can show or hide. The first two live in the
// "Precisa de ação" block, the last two are the blocks below it.
export const AGENDA_FILTER_OPTIONS = ['bookings', 'recurrences', 'today', 'upcoming'] as const;
export type AgendaFilterOption = (typeof AGENDA_FILTER_OPTIONS)[number];

const AGENDA_PREFERENCES_NAMESPACE = 'agenda';
const HIDDEN_OPTIONS_KEY = 'hiddenOptions';
const PREFERENCES_CHANGED_EVENT = 'ikaro:agenda-preferences-changed';

interface AgendaPreferencesShape {
  hiddenOptions?: readonly AgendaFilterOption[];
}

// What is stored is what the user hid, so a new option added later starts visible for everyone.
// An unknown or repeated entry (older build, hand-edited storage) is dropped, and the result keeps
// the catalog order so two equal selections always serialize alike.
export function normalizeHiddenOptions(
  hidden: readonly string[] | undefined | null,
): readonly AgendaFilterOption[] {
  if (!Array.isArray(hidden)) return [];
  const requested = new Set<string>(hidden);
  return AGENDA_FILTER_OPTIONS.filter((option) => requested.has(option));
}

// Storage is scoped by tenant: a multi-tenant staff member (CLAUDE.md §2 invariant 6) switching
// tenants must not carry one tenant's choices into another's Agenda.
export function createAgendaPreferencesStore(
  storage: BrowserPreferenceStore = createBrowserPreferenceStore(AGENDA_PREFERENCES_NAMESPACE),
  tenantId = '',
) {
  const key = `${HIDDEN_OPTIONS_KEY}:${tenantId}`;
  return {
    getHiddenOptions(): readonly AgendaFilterOption[] {
      return normalizeHiddenOptions(storage.get<AgendaPreferencesShape>(key)?.hiddenOptions);
    },
    setHiddenOptions(hiddenOptions: readonly AgendaFilterOption[]): void {
      const normalized = normalizeHiddenOptions(hiddenOptions);
      if (normalized.length === 0) {
        storage.remove(key);
        return;
      }
      storage.set<AgendaPreferencesShape>(key, { hiddenOptions: normalized });
    },
    clearHiddenOptions(): void {
      storage.remove(key);
    },
  };
}

function subscribeToPreferencesChanges(onStoreChange: () => void): () => void {
  globalThis.window?.addEventListener('storage', onStoreChange);
  globalThis.window?.addEventListener(PREFERENCES_CHANGED_EVENT, onStoreChange);
  return () => {
    globalThis.window?.removeEventListener('storage', onStoreChange);
    globalThis.window?.removeEventListener(PREFERENCES_CHANGED_EVENT, onStoreChange);
  };
}

function parseSnapshot(snapshot: string): readonly AgendaFilterOption[] {
  try {
    return normalizeHiddenOptions(JSON.parse(snapshot) as string[]);
  } catch {
    return [];
  }
}

interface AgendaPreferencesState {
  readonly hiddenOptions: readonly AgendaFilterOption[];
  readonly setHiddenOptions: (next: SetStateAction<readonly AgendaFilterOption[]>) => void;
}

// The persisted "Filtrar agenda" choice. The server render and the first client paint see "nothing
// hidden" (the default), then the stored choice applies — the same shape as Horários' filters.
export function useAgendaPreferences(): AgendaPreferencesState {
  const { tenantId } = useTenant();
  const store = useMemo(() => createAgendaPreferencesStore(undefined, tenantId), [tenantId]);
  const snapshot = useSyncExternalStore(
    subscribeToPreferencesChanges,
    () => JSON.stringify(store.getHiddenOptions()),
    () => JSON.stringify([]),
  );
  const hiddenOptions = useMemo(() => parseSnapshot(snapshot), [snapshot]);

  function setHiddenOptions(next: SetStateAction<readonly AgendaFilterOption[]>): void {
    const resolved = typeof next === 'function' ? next(hiddenOptions) : next;
    store.setHiddenOptions(resolved);
    globalThis.window?.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
  }

  return { hiddenOptions, setHiddenOptions };
}
