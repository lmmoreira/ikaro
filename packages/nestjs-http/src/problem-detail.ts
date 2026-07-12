import { HttpException } from '@nestjs/common';
import { AnyErrorCode, buildProblemDetail } from '@ikaro/types';

// Canonical throw-site for every single-cause ProblemDetail across apps/backend and apps/bff
// (TD23) — replaces hand-built `{ type, title, status, ... }` object literals + `throw new
// HttpException(...)` at guard/mapper/controller call sites. `buildProblemDetail` (the pure
// object-construction half) lives in @ikaro/types since it has no framework dependency; the
// `throw new HttpException(...)` half must live here instead — HttpException only exists in
// @nestjs/common, and apps/web (a Next.js app with no NestJS dependency) also imports from
// @ikaro/types's shared barrel. A runtime @nestjs/common import inside that barrel breaks web's
// production build even when @nestjs/common is only a peer dependency there (found the hard way
// during TD23 Story 11 — see this package's canonical-parse-pipes.ts for the same reasoning).
//
// Generic over TCode so each call site keeps its own narrow inferred type (from `err.code` on a
// typed domain error, or from an enum member reference) rather than widening to `AnyErrorCode` —
// the `extends AnyErrorCode` constraint only rejects codes that aren't in any catalogue at all.
export function throwProblemDetail<TCode extends AnyErrorCode>(
  status: number,
  code: TCode | undefined,
  detail: string,
  field?: string,
): never {
  throw new HttpException(buildProblemDetail(status, code, detail, field), status);
}
