# TD10 — BackendHttpService returns a generic 500 for unreachable-backend/timeout errors

## Status
- **State**: Resolved (2026-07-15)
- **Type**: Technical Debt / Observability clarity (not a security issue)
- **Priority**: Low
- **Context**: `apps/bff/src/shared/http/backend-http.service.ts`
- **Created**: 2026-06-22

## Problem

`BackendHttpService.call()`'s catch block only special-cases `AxiosError` instances that carry a `.response` (i.e. the backend answered with an HTTP error status):

```ts
catch (err) {
  if (err instanceof AxiosError && err.response) {
    throw new HttpException(err.response.data as object, err.response.status);
  }
  throw err;
}
```

Anything else — network failure (`ECONNREFUSED`), DNS failure, or a request timeout (`AxiosError` with no `.response`) — falls through to the bare `throw err;` and surfaces to the API consumer as a generic `500 Internal Server Error`, indistinguishable from a genuine BFF-side bug.

Flagged by CodeRabbit on PR #31 (M13-S05) as a "Critical" info-disclosure risk. Verified against the actual installed `@nestjs/core@11.1.19` source (`BaseExceptionFilter.handleUnknownError`) before accepting the claim — it does **not** leak the raw error message or stack trace to the client. For any non-`HttpException` error, Nest's built-in filter (present even with zero custom filters registered) already returns the fixed generic body `{"statusCode":500,"message":"Internal server error"}` and logs the real exception server-side only. So this is not a live vulnerability — the actual gap is purely that every distinct backend-unreachable failure mode collapses into the same generic `500`, which makes BFF-side bugs and backend-outage symptoms harder to tell apart from logs/dashboards alone.

## Resolution

Implemented in `apps/bff/src/shared/http/backend-http.service.ts` on 2026-07-15.

`BackendHttpService.call()` now keeps the existing passthrough branch for `AxiosError` instances with a backend `response`, and maps `AxiosError` instances with **no** `response` (timeout / connection refused / other upstream transport failure) to the shipped post-TD23 canonical BFF error envelope:

```ts
throwProblemDetail(
  HttpStatus.SERVICE_UNAVAILABLE,
  BffErrorCode.UPSTREAM_UNAVAILABLE,
  'Backend service unavailable',
);
```

This distinguishes upstream-unavailable failures from genuine BFF bugs while staying aligned with the live error contract (`503 Service Unavailable` + `code: BFF_UPSTREAM_UNAVAILABLE`), rather than the pre-TD23 bare-string `502` shape originally proposed here. `backend-http.service.spec.ts` now covers this branch directly.

## Acceptance criteria

- [x] Network failure / timeout against the backend returns a coded upstream-unavailable response, not a generic `500`
- [x] `backend-http.service.spec.ts` covers the new branch
- [x] No change to the existing `AxiosError` + `.response` branch (backend's own Problem Details errors still pass through unchanged)
