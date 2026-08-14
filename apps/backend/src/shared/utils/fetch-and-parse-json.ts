import { z } from 'zod';

/**
 * Fetches `url`, verifies a 2xx response, parses the body as JSON, and validates it against
 * `schema` — the four-step "call an external JSON API safely" shape this codebase's outbound
 * HTTP clients need (OpenRouter chat completions, OpenRouter credits). Throws a plain `Error`
 * prefixed with `errorLabel` at every failure point (non-2xx, invalid JSON, schema mismatch) —
 * callers decide how to handle/log the failure, this helper never swallows one.
 */
export async function fetchAndParseJson<T>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  errorLabel: string,
): Promise<T> {
  const response = await fetch(url, init);

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
