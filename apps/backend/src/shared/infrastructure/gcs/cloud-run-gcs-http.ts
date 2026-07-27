const REQUEST_TIMEOUT_MS = 5000;

export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  operation: string,
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new Error(`${operation} timed out`);
    }
    throw error;
  }
}

export async function readResponse<T>(response: Response, operation: string): Promise<T> {
  const body = await response.text();
  if (!response.ok) throw new Error(`${operation} failed with status ${response.status}: ${body}`);
  return JSON.parse(body) as T;
}

export async function readResponseText(response: Response, operation: string): Promise<string> {
  const body = await response.text();
  if (!response.ok) throw new Error(`${operation} failed with status ${response.status}: ${body}`);
  return body.trim();
}
