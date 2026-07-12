import { HttpException } from '@nestjs/common';
import {
  StaffErrorCode,
  type AuthErrorCode,
  type BffErrorCode,
  type GenericErrorCode,
  type ProblemDetail,
} from '@ikaro/types';

// Only STAFF_DEACTIVATED is reused from StaffErrorCode (single source of truth for the
// "account deactivated" condition — see docs/ENGINEERING_RULES.md § Single source of truth
// for a validation rule's code). Narrowed to that one member, not the whole StaffErrorCode
// union, so a BFF site can't accidentally throw an unrelated backend staff code — that would
// defeat the compile-time governance TD23 §9 exists to provide.
type StaffDeactivatedCode = (typeof StaffErrorCode)['DEACTIVATED'];

// Codes a BFF-originated throw site is allowed to use — spans every origin actually reused
// across the BFF (TD23 Story 11): BFF-feature-specific, framework/guard fallback, VO-less
// generic, and StaffDeactivatedCode (reused verbatim from the backend for the identical
// business condition). Typed against the union, not `string`, so an uncatalogued code fails
// to compile.
export type BffThrowableCode =
  BffErrorCode | AuthErrorCode | GenericErrorCode | StaffDeactivatedCode;

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

// Canonical envelope for every BFF-originated error (TD23 Story 11) — never throw an
// ad-hoc { type, title, status, detail } object or a bare BadRequestException(string)
// at a BFF-originated site; always go through this helper instead.
export function throwProblemDetail(
  status: number,
  code: BffThrowableCode,
  detail: string,
  field?: string,
): never {
  const body: ProblemDetail = {
    type: 'about:blank',
    title: STATUS_TITLES[status] ?? 'Error',
    status,
    code,
    detail,
    ...(field ? { field } : {}),
  };
  throw new HttpException(body, status);
}
