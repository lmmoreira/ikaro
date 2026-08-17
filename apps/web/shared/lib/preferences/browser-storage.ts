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
  if (globalThis.window === undefined) return null;
  try {
    return globalThis.window.localStorage;
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

function readNamespace(storage: BrowserStoragePort, storageKey: string): Record<string, unknown> {
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

function writeNamespace(
  storage: BrowserStoragePort,
  storageKey: string,
  values: Record<string, unknown>,
): void {
  if (Object.keys(values).length === 0) {
    storage.removeItem(storageKey);
    return;
  }

  storage.setItem(storageKey, JSON.stringify(values));
}

export function createBrowserPreferenceStore(
  namespace: string,
  storage: BrowserStoragePort = createBrowserStoragePort(),
): BrowserPreferenceStore {
  const storageKey = `ikaro:${namespace}`;

  return {
    get<T>(key: string): T | null {
      const values = readNamespace(storage, storageKey);
      return Object.hasOwn(values, key) ? (values[key] as T) : null;
    },
    set<T>(key: string, value: T): void {
      const values = readNamespace(storage, storageKey);
      values[key] = value as unknown;
      writeNamespace(storage, storageKey, values);
    },
    remove(key: string): void {
      const values = readNamespace(storage, storageKey);
      if (!Object.hasOwn(values, key)) return;
      delete values[key];
      writeNamespace(storage, storageKey, values);
    },
  };
}
