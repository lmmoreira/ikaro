import { Agent, fetch as undiciFetch, interceptors, type RequestInit } from 'undici';
import { z } from 'zod';

// A single shared dispatcher (connection pool), reused across every fetchAndParseJson call so
// keep-alive connections are actually reused rather than rebuilt per call.
//
// connectTimeout bounds only the TCP/TLS handshake phase, separately from a slow-but-connected
// response — which stays governed solely by the caller's own AbortSignal (passed via
// `init.signal`, still the hard ceiling for the whole operation: a shared AbortSignal.timeout()
// instance caps every attempt underneath it too, verified empirically — see
// OPENROUTER_TIMEOUT_MS's comment in openrouter-llm.adapter.ts). Replaces a hand-rolled retry
// loop that couldn't make this distinction — it only ever saw one error type (fetch() throwing)
// and had to guess whether a stalled connection or a genuinely slow response caused it. A real
// incident (2026-08-19) surfaced this gap: a request timed out with no corresponding entry in
// OpenRouter's own request log at all, meaning it never reached their servers — a connect-phase
// stall, not a slow response, and exactly the case this dispatcher now retries on its own short
// budget instead of burning the full response-timeout window just to notice.
//
// The retry interceptor's own defaults exclude POST (assumed non-idempotent) — every current
// caller of this helper sends either GET (already a default) or POST (OpenRouter chat
// completions/credits, both safe: a connect-phase failure means the request never reached the
// server), so POST is added explicitly rather than replacing GET's own default coverage. The
// defaults also include response-status-based retries (429/500/502/503/504), overridden to empty
// below — a completed non-2xx response is a real answer (bad auth, rate limit, already-incurred
// generation cost), never a connectivity blip worth retrying.
const RESILIENT_DISPATCHER = new Agent({ connectTimeout: 2000 }).compose(
  interceptors.retry({
    maxRetries: 2,
    minTimeout: 300,
    maxTimeout: 800,
    timeoutFactor: 2,
    methods: ['GET', 'POST'],
    errorCodes: [
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ENETDOWN',
      'ENETUNREACH',
      'EHOSTDOWN',
      'EHOSTUNREACH',
      'EPIPE',
      'UND_ERR_CONNECT_TIMEOUT',
    ],
    statusCodes: [],
  }),
);

/**
 * Fetches `url`, verifies a 2xx response, parses the body as JSON, and validates it against
 * `schema` — the four-step "call an external JSON API safely" shape this codebase's outbound
 * HTTP clients need (OpenRouter chat completions, OpenRouter credits). Throws a plain `Error`
 * prefixed with `errorLabel` at every failure point (connect failure, non-2xx, invalid JSON,
 * schema mismatch) — callers decide how to handle/log the failure, this helper never swallows
 * one. Uses undici's own Agent + retry interceptor (RESILIENT_DISPATCHER above), not a
 * hand-rolled retry loop — see its comment for why.
 */
export async function fetchAndParseJson<T>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  errorLabel: string,
): Promise<T> {
  let response;
  try {
    response = await undiciFetch(url, { ...init, dispatcher: RESILIENT_DISPATCHER });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`${errorLabel} request failed: ${cause}`);
  }

  if (!response.ok) {
    throw new Error(`${errorLabel} request failed: ${response.status} ${await response.text()}`);
  }

  // Read as text first (rather than response.json()) so the raw body is available to include in
  // the thrown error when it isn't valid JSON — response.json() consumes the body stream and
  // gives no way to inspect what was actually returned once it throws. Truncated to keep one bad
  // response from flooding the error log.
  const rawText = await response.text();
  let responseBody: unknown;
  try {
    responseBody = JSON.parse(rawText);
  } catch {
    throw new Error(
      `${errorLabel} returned a malformed response: invalid JSON: ${rawText.slice(0, 500)}`,
    );
  }

  const parsed = schema.safeParse(responseBody);
  if (!parsed.success) {
    throw new Error(`${errorLabel} returned a malformed response: ${parsed.error.message}`);
  }

  return parsed.data;
}
