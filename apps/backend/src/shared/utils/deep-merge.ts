import deepmerge from 'deepmerge';

type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value !== null && typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    for (const key of Object.keys(value as object)) {
      if (!DANGEROUS_KEYS.has(key)) {
        clean[key] = sanitize((value as Record<string, unknown>)[key]);
      }
    }
    return clean;
  }
  return value;
}

/**
 * Deep-merges `override` into `base`, returning a new object.
 *
 * Key behaviours:
 * - Nested objects are merged recursively (not replaced wholesale).
 * - A `null` override value replaces the base value (important for nullable
 *   JSONB fields such as `businessHours.sunday = null`).
 * - Arrays are replaced, not concatenated (JSONB layout arrays must be
 *   replaced in their entirety when updated).
 * - The original objects are never mutated.
 * - Prototype-pollution keys (__proto__, constructor, prototype) are stripped
 *   from `override` before merging — override comes from admin-supplied JSON (UC-026).
 */
export function deepMerge<T extends object>(base: T, override: DeepPartial<T>): T {
  return deepmerge(base, sanitize(override) as T, {
    arrayMerge: (_dest, source) => source,
  }) as T;
}
