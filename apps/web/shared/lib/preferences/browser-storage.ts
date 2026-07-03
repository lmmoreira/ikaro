export interface BrowserStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BrowserPreferenceStore {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

function createNoopStoragePort(): BrowserStoragePort {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

function getWindowStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createBrowserStoragePort(): BrowserStoragePort {
  const storage = getWindowStorage();
  if (!storage) return createNoopStoragePort();

  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
}

export function createBrowserPreferenceStore(
  namespace: string,
  storage: BrowserStoragePort = createBrowserStoragePort(),
): BrowserPreferenceStore {
  const storageKey = `ikaro:${namespace}`;
  const hasOwn = (object: Record<string, unknown>, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(object, key);

  function readNamespace(): Record<string, unknown> {
    const raw = storage.getItem(storageKey);
    if (!raw) return {};

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      storage.removeItem(storageKey);
      return {};
    }

    storage.removeItem(storageKey);
    return {};
  }

  function writeNamespace(values: Record<string, unknown>): void {
    if (Object.keys(values).length === 0) {
      storage.removeItem(storageKey);
      return;
    }

    storage.setItem(storageKey, JSON.stringify(values));
  }

  return {
    get<T>(key: string): T | null {
      const values = readNamespace();
      return hasOwn(values, key) ? (values[key] as T) : null;
    },
    set<T>(key: string, value: T): void {
      const values = readNamespace();
      values[key] = value as unknown;
      writeNamespace(values);
    },
    remove(key: string): void {
      const values = readNamespace();
      if (!hasOwn(values, key)) return;
      delete values[key];
      writeNamespace(values);
    },
  };
}
