import type { ValidationProblemDetail } from '@ikaro/types';

// Shared across every fetch-based API helper that needs to stop discarding the response body on
// error (TD23 Story 12) — extracts the canonical envelope's `code`/`field`/`violations`/`detail`
// so a caller's error class can populate them instead of only carrying `status`.
export async function parseErrorBody(res: Response): Promise<Partial<ValidationProblemDetail>> {
  return ((await res.json().catch(() => null)) ?? {}) as Partial<ValidationProblemDetail>;
}

// Base for every single-cause fetch error (TD23 §2 — code + optional field, not violations[]).
// Mirrors the backend's XxxDomainError pattern (e.g. BookingDomainError): the constructor
// boilerplate (super/setPrototypeOf/property assignment) lives here once; each named subclass
// computes its own `message` + `name` and forwards `detail` through. Batch-validation callers
// (CreateBookingError, SubmitGuestBookingInfoError) add their own `violations` property on top,
// same as backend keeps `violations` out of its single-cause domain error base.
//
// `detail` is kept out of `message` deliberately: TD23 §1 defines `detail` as backend-internal
// debug text that must never be rendered to a user, and folding it into `Error.message` is an
// attractive nuisance for a future `catch (err) { show(err.message) }` — exactly the leak this TD
// closes elsewhere. `detail` is still exposed as its own readonly property for logs/debugging.
export class FetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly field?: string,
    public readonly detail?: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Constructor shape shared by every single-cause FetchError subclass (no violations) — lets
// assertOk() construct and throw the right subclass generically instead of repeating
// `parseErrorBody()` + `throw new Xxx(...)` at every fetch call site.
type SingleCauseErrorCtor<E extends FetchError> = new (
  status: number,
  code?: string,
  field?: string,
  detail?: string,
) => E;

// Checks `res.ok`; on failure, parses the body and throws `ErrorClass` populated with
// status/code/field/detail. Only for single-cause subclasses (see SingleCauseErrorCtor) —
// CreateBookingError/SubmitGuestBookingInfoError carry `violations` too and stay manual.
export async function assertOk<E extends FetchError>(
  res: Response,
  ErrorClass: SingleCauseErrorCtor<E>,
): Promise<void> {
  if (res.ok) return;
  const body = await parseErrorBody(res);
  throw new ErrorClass(res.status, body.code, body.field, body.detail);
}

export class AuthError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'AuthError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ForbiddenError extends Error {
  constructor(
    detail: string,
    public readonly data?: unknown,
  ) {
    super(detail);
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly data?: unknown,
  ) {
    super(detail);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
