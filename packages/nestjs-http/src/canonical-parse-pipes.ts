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
// Shared between apps/backend and apps/bff (identical NestJS pipe logic, no per-app
// customization needed) — lives in its own package (never consumed by apps/web) rather than
// @ikaro/types, since a runtime @nestjs/common import inside a shared barrel apps/web also
// imports from breaks web's production build even when @nestjs/common is only a peer
// dependency (found the hard way — see TD23 Story 11's PR history).
@Injectable()
export class CanonicalParseUUIDPipe extends ParseUUIDPipe {
  override async transform(value: string, metadata: ArgumentMetadata): Promise<string> {
    const field = metadata.data ?? 'value';
    // A missing value (undefined query param) and a malformed value are different failure
    // modes — conflating them under FORMAT_INVALID tells the caller "you sent something wrong"
    // when they sent nothing at all, and makes controller-level FIELD_REQUIRED checks
    // unreachable for params this pipe already guards. Route params (@Param) can never reach
    // here undefined (Express wouldn't match the route), so this only matters for @Query.
    if (value === undefined || value === null || value === '') {
      throw new HttpException(
        buildParseFailureProblem(GenericErrorCode.FIELD_REQUIRED, `${field} is required`, field),
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await super.transform(value, metadata);
    } catch {
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
    const field = metadata.data ?? 'value';
    if (value === undefined || value === null || value === '') {
      throw new HttpException(
        buildParseFailureProblem(GenericErrorCode.FIELD_REQUIRED, `${field} is required`, field),
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await super.transform(value, metadata);
    } catch {
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
