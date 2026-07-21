/**
 * M17-S33 security fix — query-string params that must never leave this process as a raw span
 * attribute value. `@opentelemetry/instrumentation-http`'s `redactedQueryParams` option
 * *replaces* (not extends) its own defaults, so the upstream defaults are restated here
 * alongside the app-specific ones — losing them would silently stop redacting cloud-signing
 * params too.
 *
 * OAuth authorization-code flow params (`code`, `state`, `error`, `error_description`) matter
 * because the BFF's `/auth/google/callback` route receives a redeemable authorization `code`
 * and the signed `state` directly as query params (apps/bff/src/features/auth/auth.controller.ts)
 * — without this, both would be captured verbatim in the incoming request span's `url.query`/
 * `http.target` attributes and shipped to the collector/trace backend.
 */
export const SENSITIVE_QUERY_PARAMS: ReadonlySet<string> = new Set([
  // @opentelemetry/instrumentation-http's own defaults (DEFAULT_QUERY_STRINGS_TO_REDACT)
  'sig',
  'Signature',
  'AWSAccessKeyId',
  'X-Goog-Signature',
  // OAuth authorization-code flow
  'code',
  'state',
  'error',
  'error_description',
]);

const REDACTED = 'REDACTED';

/**
 * Redacts sensitive query param values from a path+query string (e.g. `request.url` on an
 * `IncomingMessage`, or `request.path` on a `ClientRequest`). Only the value is replaced —
 * param names and structure are preserved so the span attribute stays useful for routing/
 * debugging without leaking secrets.
 */
export function redactSensitiveQueryParams(pathAndQuery: string): string {
  const queryIndex = pathAndQuery.indexOf('?');
  if (queryIndex === -1) {
    return pathAndQuery;
  }

  const path = pathAndQuery.slice(0, queryIndex);
  const query = pathAndQuery.slice(queryIndex + 1);
  const params = new URLSearchParams(query);

  for (const key of params.keys()) {
    if (SENSITIVE_QUERY_PARAMS.has(key)) {
      params.set(key, REDACTED);
    }
  }

  return `${path}?${params.toString()}`;
}
