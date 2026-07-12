import {
  ArgumentMetadata,
  HttpException,
  HttpStatus,
  Injectable,
  ParseIntPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { GenericErrorCode, ProblemDetail } from '@ikaro/types';

function buildParseFailureProblem(
  code: GenericErrorCode,
  detail: string,
  field: string,
): ProblemDetail {
  return {
    type: 'about:blank',
    title: 'Bad Request',
    status: HttpStatus.BAD_REQUEST,
    code,
    detail,
    field,
  };
}

// Route-param UUID/int parse failures used Nest's default BadRequestException(string) shape —
// a 3rd incompatible error shape alongside the single-cause {code} and batch {violations[]}
// shapes (TD23 Story 11). Single-cause per TD23 §2 (one param, one value) — top-level
// code/field, never violations[]. No VO backs "is this a UUID/integer" — GenericErrorCode per
// docs/ENGINEERING_RULES.md § Single source of truth for a validation rule's code.
@Injectable()
export class CanonicalParseUUIDPipe extends ParseUUIDPipe {
  override async transform(value: string, metadata: ArgumentMetadata): Promise<string> {
    try {
      return await super.transform(value, metadata);
    } catch {
      const field = metadata.data ?? 'value';
      throw new HttpException(
        buildParseFailureProblem(
          GenericErrorCode.FORMAT_INVALID,
          `${field} must be a valid UUID`,
          field,
        ),
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}

@Injectable()
export class CanonicalParseIntPipe extends ParseIntPipe {
  override async transform(value: string, metadata: ArgumentMetadata): Promise<number> {
    try {
      return await super.transform(value, metadata);
    } catch {
      const field = metadata.data ?? 'value';
      throw new HttpException(
        buildParseFailureProblem(
          GenericErrorCode.VALUE_INVALID,
          `${field} must be an integer`,
          field,
        ),
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
