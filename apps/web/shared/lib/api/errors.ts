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
// is a thin `super(status, code, field, detail)` + its own `name`. Batch-validation callers
// (CreateBookingError, SubmitGuestBookingInfoError) add their own `violations` property on top,
// same as backend keeps `violations` out of its single-cause domain error base.
export class FetchError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
    public readonly field?: string,
    detail?: string,
  ) {
    super(detail ?? `Request failed (${status})`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'AuthError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ForbiddenError extends Error {
  constructor(detail: string) {
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
