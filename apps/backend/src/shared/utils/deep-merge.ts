import deepmerge from 'deepmerge';

type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

/**
 * Deep-merges `override` into `base`, returning a new object.
 *
 * Key behaviours:
 * - Nested objects are merged recursively (not replaced wholesale).
 * - A `null` override value replaces the base value (important for nullable
 *   JSONB fields such as `business_hours.sunday = null`).
 * - Arrays are replaced, not concatenated (JSONB layout arrays must be
 *   replaced in their entirety when updated).
 * - The original objects are never mutated.
 */
export function deepMerge<T extends object>(base: T, override: DeepPartial<T>): T {
  return deepmerge(base, override as T, {
    arrayMerge: (_dest, source) => source,
  }) as T;
}
