import { BillingErrorCode, type ProblemDetail, type ValidationProblemDetail } from '@ikaro/types';

// Shared across every fetch-based API helper that needs to stop discarding the response body on
// error (TD23 Story 12) — extracts the canonical envelope's `code`/`field`/`violations`/`detail`
// so a caller's error class can populate them instead of only carrying `status`.
export async function parseErrorBody(res: Response): Promise<Partial<ValidationProblemDetail>> {
  return ((await res.json().catch(() => null)) ?? {}) as Partial<ValidationProblemDetail>;
}

// Base for every single-cause fetch error (TD23 §2 — code + optional field, not violations[]).
// Mirrors the backend's XxxDomainError pattern (e.g. BookingDomainError): the constructor
// boilerplate (super/setPrototypeOf/property assignment) lives here once; each named subclass
// computes its own `message` + `name` and forwards `detail` through. A batch-validation caller
// can still add its own `violations` property on top of a subclass if it needs one, same as
// backend keeps `violations` out of its single-cause domain error base.
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

// Single-cause FetchError subclass shared by every my-account-style server fetcher, regardless
// of which domain's data it reads (TD31 Story 9+11): customer/api.server.ts, booking/api/
// customer.server.ts, and loyalty/api.server.ts all throw this on a failed BFF read. Lives here
// rather than under features/customer/ because it carries no Customer-specific shape — moving it
// out of the customer slice avoids the booking/loyalty slices importing an error type from a
// sibling domain slice for a purely generic HTTP-status/code/field/detail carrier.
export class CustomerFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(`Customer request failed (${status})`, status, code, field, detail);
    this.name = 'CustomerFetchError';
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
// status/code/field/detail. Only for single-cause subclasses (see SingleCauseErrorCtor) — a
// subclass that also carries `violations` stays manual.
export async function assertOk<E extends FetchError>(
  res: Response,
  ErrorClass: SingleCauseErrorCtor<E>,
): Promise<void> {
  if (res.ok) return;
  const body = await parseErrorBody(res);
  throw new ErrorClass(res.status, body.code, body.field, body.detail);
}

// The two typed billing denials are `403`s, but the caller is logged in: the tenant lacks a
// feature, or is suspended on a route that does not admit the caller (UC-125, UC-121).
export function isBillingDenial(err: FetchError): boolean {
  return (
    err.status === 403 &&
    (err.code === BillingErrorCode.FEATURE_NOT_ENTITLED ||
      err.code === BillingErrorCode.TENANT_SUSPENDED)
  );
}

// `true` when the session no longer authenticates the caller at this tenant: a `401`, or a `403`
// that is not a billing denial. Redirecting to login on a billing denial instead sends a logged-in
// customer into a login loop, because the login page returns them to the page that was denied.
export function isSessionRejected(err: FetchError): boolean {
  return err.status === 401 || (err.status === 403 && !isBillingDenial(err));
}

// Resolves to `null` when the tenant does not hold the feature behind this read, so a page can
// hide that surface instead of failing (a tenant without `LOYALTY` still has a working account).
// Every other failure, including a suspension denial, is rethrown unchanged.
export async function nullWhenNotEntitled<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof FetchError && err.code === BillingErrorCode.FEATURE_NOT_ENTITLED) {
      return null;
    }
    throw err;
  }
}

export class AuthError extends Error {
  constructor(
    detail: string,
    public readonly data?: unknown,
  ) {
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

export interface ProblemDetailShape {
  readonly code?: string;
  readonly field?: string;
  // Values the translated message interpolates (e.g. the business limit a request exceeded).
  readonly params?: Readonly<Record<string, string | number>>;
}

// bffClient's response interceptor collapses every failure into ApiError/AuthError/ForbiddenError,
// each carrying the raw ProblemDetail body under `.data` — this extracts code/field uniformly so a
// caller only needs one check instead of a separate instanceof branch per error class. A raw
// `fetch` helper that goes through assertOk() throws a FetchError subclass instead, which carries
// the same code/field as plain properties.
export function extractProblemDetailShape(err: unknown): ProblemDetailShape | null {
  if (err instanceof FetchError) return { code: err.code, field: err.field };
  if (!(err instanceof ApiError || err instanceof AuthError || err instanceof ForbiddenError)) {
    return null;
  }
  const data = err.data as Partial<ProblemDetail> | undefined;
  return { code: data?.code, field: data?.field, params: data?.params };
}
