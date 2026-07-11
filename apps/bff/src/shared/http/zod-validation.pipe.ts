import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodIssue, ZodType } from 'zod';
import {
  EmailErrorCode,
  GenericErrorCode,
  ValidationProblemDetail,
  ValidationViolation,
} from '@ikaro/types';

/**
 * Derives a stable `code` per Zod violation instead of leaking free-text `issue.message`.
 * Mirrors apps/backend/src/shared/http/zod-validation.pipe.ts's deriveViolation() — same
 * two-category split, per docs/ENGINEERING_RULES.md § Single source of truth for a
 * validation rule's code:
 * - `custom` (`.refine()`) issues MUST supply their code via `params.code` — this is how a
 *   BFF rule that duplicates a backend VO's own check (e.g. one of the 3 AddressSchema
 *   copies) reuses that VO's error code instead of a bespoke one.
 * - Every other native Zod issue code has no VO behind it — these share the small, closed
 *   GenericErrorCode set. The switch is exhaustive (the `never` check on `default` fails to
 *   compile if a future Zod upgrade adds an issue code this function doesn't handle yet).
 *
 * `z.email()` is special-cased to `EmailErrorCode.FORMAT_INVALID` for the same reason as the
 * backend pipe — it duplicates the `Email` VO's rule without being a `.refine()` call.
 */
export function deriveViolation(issue: ZodIssue): ValidationViolation {
  const field = issue.path.join('.');
  switch (issue.code) {
    case 'invalid_type':
      return { field, code: GenericErrorCode.FIELD_REQUIRED };
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

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const violations = result.error.issues.map(deriveViolation);
      const body: ValidationProblemDetail = {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'Request body validation failed',
        violations,
      };
      throw new BadRequestException(body);
    }
    return result.data;
  }
}
