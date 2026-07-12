import { throwProblemDetail as throwProblemDetailBase } from '@ikaro/nestjs-http';
import {
  StaffErrorCode,
  type AuthErrorCode,
  type BffErrorCode,
  type GenericErrorCode,
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
// business condition). Typed against this narrower union rather than the shared package's
// AnyErrorCode, so a BFF site can't accidentally throw an unrelated backend-only code — that
// would defeat the compile-time governance TD23 §9 exists to provide.
export type BffThrowableCode =
  BffErrorCode | AuthErrorCode | GenericErrorCode | StaffDeactivatedCode;

// Canonical envelope for every BFF-originated error (TD23 Story 11) — never throw an
// ad-hoc { type, title, status, detail } object or a bare BadRequestException(string)
// at a BFF-originated site; always go through this helper instead. Delegates envelope
// construction + the actual HttpException throw to @ikaro/nestjs-http's shared
// implementation (also used by apps/backend) — this wrapper's only job is narrowing the
// code type to what a BFF site is allowed to throw.
export function throwProblemDetail(
  status: number,
  code: BffThrowableCode,
  detail: string,
  field?: string,
): never {
  return throwProblemDetailBase(status, code, detail, field);
}
