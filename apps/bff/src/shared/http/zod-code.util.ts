import { ZodString } from 'zod';

/**
 * Wraps a string schema with an explicit error `code`, for a required-field check that
 * duplicates a rule already owned by a backend VO/context — see docs/ENGINEERING_RULES.md §
 * Single source of truth for a validation rule's code. Preserves exact pass/fail behavior of
 * a plain `.min(1)` (non-empty, no trimming) while giving the violation the same code the
 * backend's own VO would emit for the identical failure, instead of a generic bucket code.
 */
export function requiredWithCode<T extends ZodString>(schema: T, code: string): T {
  return schema.refine((v) => v.length > 0, {
    error: 'this field is required',
    params: { code },
  }) as T;
}
