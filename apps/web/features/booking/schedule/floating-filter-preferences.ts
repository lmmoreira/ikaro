import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  createBrowserPreferenceStore,
  type BrowserPreferenceStore,
} from '@/shared/lib/preferences/browser-storage';
import { useTenant } from '@/providers/tenant-provider';
import {
  DEFAULT_FLOATING_FILTER_CORNER,
  isFloatingFilterCorner,
  type FloatingFilterCorner,
} from '../model/floating-filter-corner';

// One remembered corner per page: the Agenda has its own, Horários has one for both its filters.
export type FloatingFilterPageKey = 'agenda' | 'schedule';

const FLOATING_FILTER_NAMESPACE = 'floating-filter';
const PREFERENCES_CHANGED_EVENT = 'ikaro:floating-filter-preferences-changed';

interface StoredCorner {
  corner?: unknown;
}

// What is stored is the corner, never coordinates, so a resize or a phone rotation cannot leave
// the pill off-screen. An unknown value (older build, hand-edited storage) falls back to the
// default, and the default itself is never stored: removing the key is how "reset" works.
export function normalizeCorner(value: unknown): FloatingFilterCorner {
  return isFloatingFilterCorner(value) ? value : DEFAULT_FLOATING_FILTER_CORNER;
}

// Storage is scoped by tenant and page: a multi-tenant staff member (CLAUDE.md §2 invariant 6)
// switching tenants must not carry one tenant's choice into another's page.
export function createFloatingFilterPreferencesStore(
  pageKey: FloatingFilterPageKey,
  storage: BrowserPreferenceStore = createBrowserPreferenceStore(FLOATING_FILTER_NAMESPACE),
  tenantId = '',
) {
  const key = `corner:${tenantId}:${pageKey}`;
  return {
    getCorner(): FloatingFilterCorner {
      return normalizeCorner(storage.get<StoredCorner>(key)?.corner);
    },
    setCorner(corner: FloatingFilterCorner): void {
      const normalized = normalizeCorner(corner);
      if (normalized === DEFAULT_FLOATING_FILTER_CORNER) {
        storage.remove(key);
        return;
      }
      storage.set<StoredCorner>(key, { corner: normalized });
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

interface FloatingFilterCornerState {
  readonly corner: FloatingFilterCorner;
  readonly setCorner: (corner: FloatingFilterCorner) => void;
}

// The persisted corner. The server render and the first client paint see the default corner, then
// the stored choice applies — the same shape as the Agenda's filter choice.
export function useFloatingFilterCorner(pageKey: FloatingFilterPageKey): FloatingFilterCornerState {
  const { tenantId } = useTenant();
  const store = useMemo(
    () => createFloatingFilterPreferencesStore(pageKey, undefined, tenantId),
    [pageKey, tenantId],
  );
  const corner = useSyncExternalStore(
    subscribeToPreferencesChanges,
    () => store.getCorner(),
    () => DEFAULT_FLOATING_FILTER_CORNER,
  );

  const setCorner = useCallback(
    (next: FloatingFilterCorner): void => {
      store.setCorner(next);
      globalThis.window?.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
    },
    [store],
  );

  return { corner, setCorner };
}
