import { Agent, fetch as undiciFetch, interceptors, type RequestInit } from 'undici';
import { z } from 'zod';

// A single shared Agent (connection pool), reused across every fetchAndParseJson call so
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
// stall, not a slow response, and exactly the case the dispatchers below now retry on their own
// short budget instead of burning the full response-timeout window just to notice.
const AGENT = new Agent({ connectTimeout: 2000 });

// GET (OpenRouter credits) is idempotent, so undici's full default error-code set is safe to
// retry as-is — restated explicitly (rather than left to the interceptor's own defaults) only to
// add UND_ERR_CONNECT_TIMEOUT, which undici excludes by default despite it being exactly the
// connect-phase stall from the incident above. statusCodes overridden to empty — a completed
// non-2xx response is a real answer (bad auth, rate limit), never a connectivity blip worth
// retrying.
const GET_RESILIENT_DISPATCHER = AGENT.compose(
  interceptors.retry({
    maxRetries: 2,
    minTimeout: 300,
    maxTimeout: 800,
    timeoutFactor: 2,
    methods: ['GET'],
    errorCodes: [
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ENETDOWN',
      'ENETUNREACH',
      'EHOSTDOWN',
      'EHOSTUNREACH',
      'EPIPE',
      'UND_ERR_SOCKET',
      'UND_ERR_CONNECT_TIMEOUT',
    ],
    statusCodes: [],
  }),
);

// POST (OpenRouter chat completions) is a non-idempotent, billable call with no provider
// idempotency key, so it gets its own narrower error-code set — undici's own default already
// excludes POST from retries entirely for this reason. Retrying it is only safe for errors that
// are provably pre-send: the TCP/TLS handshake itself failing (refused, DNS failure, network/host
// unreachable) or the connect-phase timeout above — none of these can occur once a byte of the
// request has actually reached the server. ECONNRESET, EPIPE, and UND_ERR_SOCKET are deliberately
// left out even though GET retries them: each can just as easily fire after the request body was
// already fully written and the provider had started (and started billing for) generation, which
// this caller has no way to distinguish from a genuine pre-send failure after the fact — retrying
// in that case would silently double-bill a real, already-in-flight generation.
const POST_RESILIENT_DISPATCHER = AGENT.compose(
  interceptors.retry({
    maxRetries: 2,
    minTimeout: 300,
    maxTimeout: 800,
    timeoutFactor: 2,
    methods: ['POST'],
    errorCodes: [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ENETDOWN',
      'ENETUNREACH',
      'EHOSTDOWN',
      'EHOSTUNREACH',
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
 * one. Uses undici's own Agent + retry interceptors (GET_RESILIENT_DISPATCHER /
 * POST_RESILIENT_DISPATCHER above — see their comments for why they differ), not a hand-rolled
 * retry loop.
 */
export async function fetchAndParseJson<T>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  errorLabel: string,
): Promise<T> {
  const dispatcher =
    init.method?.toUpperCase() === 'POST' ? POST_RESILIENT_DISPATCHER : GET_RESILIENT_DISPATCHER;

  let response;
  try {
    response = await undiciFetch(url, { ...init, dispatcher });
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
