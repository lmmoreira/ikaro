import type { core } from 'zod';
import { EmailErrorCode, GenericErrorCode } from './error-codes';
import type { ValidationViolation } from './errors.dto';

type ZodIssue = core.$ZodIssue;

/**
 * Derives a stable `code` per Zod violation instead of leaking free-text `issue.message`.
 * Shared by both apps/backend and apps/bff's Zod pipes — each app validates its own request
 * shapes, but a rule that duplicates a backend VO's own check must emit the SAME code
 * regardless of which layer catches it first, so this derivation logic has exactly one
 * implementation rather than two independently-maintained copies (see
 * docs/ENGINEERING_RULES.md § Single source of truth for a validation rule's code).
 *
 * Two categories:
 * - `custom` (`.refine()`) issues MUST supply their code via `params.code` — this is how a
 *   rule that duplicates a VO's own check (e.g. `.refine(Email.isValid, ...)`) reuses that
 *   VO's error code instead of a bespoke one. A missing `params.code` is a schema-authoring
 *   bug — `deriveViolation` doesn't throw for it (a malformed schema shouldn't 500 every
 *   request that hits it), but it doesn't invent a specific code either: it falls back to
 *   `GenericErrorCode.VALUE_INVALID`, the same least-specific bucket an uncoded custom issue
 *   would get anyway. That fallback is a deliberate degrade-gracefully choice, not a signal
 *   that omitting `params.code` is fine — every `.refine()` in this codebase should set one.
 * - Every other native Zod issue code has no VO behind it — these share the small, closed
 *   GenericErrorCode set. The switch is exhaustive (the `never` check on `default` fails to
 *   compile if a future Zod upgrade adds an issue code this function doesn't handle yet —
 *   Zod v3→v4 already once restructured `invalid_string` into `invalid_format`).
 *
 * One native check is special-cased: `z.email()` is Zod's own built-in format validator, but
 * it duplicates the `Email` VO's rule exactly like a `.refine(Email.isValid, ...)` would — so
 * it reuses `EmailErrorCode.FORMAT_INVALID` instead of the generic bucket, without requiring
 * every `z.email()` call site to switch to an explicit `.refine()`.
 *
 * `invalid_type` covers two different situations Zod doesn't separate by `code` alone — a
 * field that's missing entirely vs. one that's present with the wrong type (e.g. a boolean
 * field sent as a string). `issue.input` distinguishes them (`undefined` only when truly
 * absent), but Zod omits it by default — callers MUST pass `{ reportInput: true }` to
 * `safeParse()` for this distinction to work; without it every `invalid_type` issue looks
 * "missing" even when a wrong-type value was actually sent. The raw input is only used as a
 * presence check here — it is never forwarded into the outgoing violation.
 */
export function deriveViolation(issue: ZodIssue): ValidationViolation {
  const field = issue.path.join('.');
  switch (issue.code) {
    case 'invalid_type':
      return {
        field,
        code:
          issue.input === undefined
            ? GenericErrorCode.FIELD_REQUIRED
            : GenericErrorCode.VALUE_INVALID,
      };
    case 'too_small':
      return {
        field,
        code:
          issue.origin === 'string'
            ? GenericErrorCode.VALUE_TOO_SHORT
            : GenericErrorCode.VALUE_OUT_OF_RANGE,
        params: { minimum: Number(issue.minimum) },
      };
    case 'too_big':
      return {
        field,
        code:
          issue.origin === 'string'
            ? GenericErrorCode.VALUE_TOO_LONG
            : GenericErrorCode.VALUE_OUT_OF_RANGE,
        params: { maximum: Number(issue.maximum) },
      };
    case 'invalid_format':
      return {
        field,
        code:
          issue.format === 'email'
            ? EmailErrorCode.FORMAT_INVALID
            : GenericErrorCode.FORMAT_INVALID,
      };
    case 'not_multiple_of':
      return { field, code: GenericErrorCode.VALUE_OUT_OF_RANGE };
    case 'unrecognized_keys':
    case 'invalid_union':
    case 'invalid_key':
    case 'invalid_element':
    case 'invalid_value':
      return { field, code: GenericErrorCode.VALUE_INVALID };
    case 'custom': {
      const params = (issue.params ?? {}) as Record<string, unknown>;
      const { code, ...rest } = params;
      const violationCode = typeof code === 'string' ? code : GenericErrorCode.VALUE_INVALID;
      // ValidationViolation.params only accepts string | number — a boolean/object/array
      // param on a .refine() call is silently dropped here, not coerced or rejected.
      const restParams = Object.fromEntries(
        Object.entries(rest).filter(
          (entry): entry is [string, string | number] =>
            typeof entry[1] === 'string' || typeof entry[1] === 'number',
        ),
      );
      return {
        field,
        code: violationCode,
        ...(Object.keys(restParams).length > 0 ? { params: restParams } : {}),
      };
    }
    default: {
      const exhaustiveCheck: never = issue;
      throw new Error(`Unhandled Zod issue code: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}
