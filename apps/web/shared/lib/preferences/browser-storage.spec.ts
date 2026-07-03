// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserPreferenceStore, createBrowserStoragePort } from './browser-storage';

describe('browser storage preferences', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores and reads namespaced values', () => {
    const memory = new Map<string, string>();
    const store = createBrowserPreferenceStore('schedule', {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    });

    store.set('viewMode', 'week');

    expect(store.get<string>('viewMode')).toBe('week');
    expect(memory.get('ikaro:schedule')).toBe(JSON.stringify({ viewMode: 'week' }));
  });

  it('keeps namespaces isolated', () => {
    const memory = new Map<string, string>();
    const scheduleStore = createBrowserPreferenceStore('schedule', {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    });
    const servicesStore = createBrowserPreferenceStore('services', {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    });

    scheduleStore.set('viewMode', 'day');
    servicesStore.set('lastTab', 'active');

    expect(scheduleStore.get<string>('viewMode')).toBe('day');
    expect(servicesStore.get<string>('lastTab')).toBe('active');
    expect(memory.get('ikaro:schedule')).toBe(JSON.stringify({ viewMode: 'day' }));
    expect(memory.get('ikaro:services')).toBe(JSON.stringify({ lastTab: 'active' }));
  });

  it('removes stored values', () => {
    const memory = new Map<string, string>();
    const store = createBrowserPreferenceStore('schedule', {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    });

    store.set('viewMode', 'week');
    store.remove('viewMode');

    expect(store.get<string>('viewMode')).toBeNull();
    expect(memory.has('ikaro:schedule')).toBe(false);
  });

  it('drops invalid json payloads and falls back to an empty store', () => {
    const memory = new Map<string, string>([['ikaro:schedule', '{not-json']]);
    const store = createBrowserPreferenceStore('schedule', {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    });

    expect(store.get<string>('viewMode')).toBeNull();
    expect(memory.has('ikaro:schedule')).toBe(false);
  });

  it('returns a noop storage port when localStorage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => {
          throw new Error('blocked');
        },
      });

      const port = createBrowserStoragePort();

      expect(typeof port.getItem).toBe('function');
      expect(typeof port.setItem).toBe('function');
      expect(typeof port.removeItem).toBe('function');
    } finally {
      if (original) {
        Object.defineProperty(window, 'localStorage', original);
      }
    }
  });
});
