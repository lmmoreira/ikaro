import { z } from 'zod';

// Backoff between retries of a network-level fetch failure (connection refused, DNS failure,
// TLS error — fetch() itself throwing) — never applied to a non-2xx HTTP response, which is a
// completed round-trip, not a transient connectivity blip, and retrying it wastes time/cost on
// what's usually a genuine client/auth error. 2 retries (3 attempts total) with a short,
// deliberately non-exponential backoff — this call sits behind a user-facing request (chatbot
// message send), so it must fail fast enough to stay within the caller's own timeout budget
// rather than accumulate a long exponential tail.
const FETCH_RETRY_BACKOFF_MS = [300, 800];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A genuine network-level failure (DNS, connection refused, TLS error) rejects fetch() with a
// TypeError per the WHATWG fetch spec — cheap and worth retrying. An aborted/timed-out request
// (the caller's own AbortSignal.timeout() firing) rejects with a DOMException instead, and means
// the server was just slow to respond within the caller's own timeout budget — retrying that
// with the same budget again doesn't meaningfully improve the odds and just multiplies the
// caller's own worst-case wait, so it's never retried here.
function isRetryableNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  errorLabel: string,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      if (!isRetryableNetworkError(err)) {
        throw new Error(`${errorLabel} request failed: ${cause}`);
      }
      if (attempt >= FETCH_RETRY_BACKOFF_MS.length) {
        throw new Error(`${errorLabel} request failed after retries: ${cause}`);
      }
      await sleep(FETCH_RETRY_BACKOFF_MS[attempt]);
    }
  }
}

/**
 * Fetches `url`, verifies a 2xx response, parses the body as JSON, and validates it against
 * `schema` — the four-step "call an external JSON API safely" shape this codebase's outbound
 * HTTP clients need (OpenRouter chat completions, OpenRouter credits). Throws a plain `Error`
 * prefixed with `errorLabel` at every failure point (non-2xx, invalid JSON, schema mismatch) —
 * callers decide how to handle/log the failure, this helper never swallows one. A genuine
 * network-level failure (fetch() throwing a TypeError) is retried with a short backoff before
 * giving up; an aborted/timed-out request is not — see fetchWithRetry above.
 */
export async function fetchAndParseJson<T>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  errorLabel: string,
): Promise<T> {
  const response = await fetchWithRetry(url, init, errorLabel);

  if (!response.ok) {
    throw new Error(`${errorLabel} request failed: ${response.status} ${await response.text()}`);
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new Error(`${errorLabel} returned a malformed response: invalid JSON`);
  }

  const parsed = schema.safeParse(responseBody);
  if (!parsed.success) {
    throw new Error(`${errorLabel} returned a malformed response: ${parsed.error.message}`);
  }

  return parsed.data;
}
