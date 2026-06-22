# TD10 — BackendHttpService returns a generic 500 for unreachable-backend/timeout errors

## Status
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

## Proposed fix (not yet scoped as a story)

Add one more branch to the same `catch` block:

```ts
catch (err) {
  if (err instanceof AxiosError && err.response) {
    throw new HttpException(err.response.data as object, err.response.status);
  }
  if (err instanceof AxiosError) {
    throw new HttpException('Backend service unavailable', HttpStatus.BAD_GATEWAY);
  }
  throw err;
}
```

Distinguishes "backend unreachable/timed out" (`502`) from "something broke inside the BFF itself" (falls through to Nest's default `500`). Touches one private method shared by all 7 HTTP verbs (`get`/`post`/`patch`/`delete`/`getForPublic`/`postForPublic`/`patchForPublic`); extend `backend-http.service.spec.ts` with a timeout/`ECONNREFUSED` case per verb family. Estimated effort: small (~15-30 min).

## Acceptance criteria (when this is picked up)

- [ ] Network failure / timeout against the backend returns `502 Bad Gateway`, not a generic `500`
- [ ] `backend-http.service.spec.ts` covers the new branch
- [ ] No change to the existing `AxiosError` + `.response` branch (backend's own Problem Details errors must still pass through unchanged)
