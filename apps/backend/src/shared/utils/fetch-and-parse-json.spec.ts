import { z } from 'zod';
import { fetchAndParseJson } from './fetch-and-parse-json';

const schema = z.object({ value: z.number() });

function mockSuccessResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function mockFailureResponse(status: number, text = 'server error'): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

describe('fetchAndParseJson', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('calls fetch with the given url and init, returning the schema-validated body', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse({ value: 42 }));

    const result = await fetchAndParseJson(
      'https://example.com/api',
      { method: 'GET' },
      schema,
      'Example',
    );

    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/api', { method: 'GET' });
    expect(result).toEqual({ value: 42 });
  });

  it('throws "<label> request failed: <status> <text>" on a non-ok response', async () => {
    fetchSpy.mockResolvedValue(mockFailureResponse(503, 'upstream down'));

    await expect(
      fetchAndParseJson('https://example.com/api', {}, schema, 'Example'),
    ).rejects.toThrow('Example request failed: 503 upstream down');
  });

  it('throws "<label> returned a malformed response: invalid JSON" when the body is not valid JSON', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response);

    await expect(
      fetchAndParseJson('https://example.com/api', {}, schema, 'Example'),
    ).rejects.toThrow('Example returned a malformed response: invalid JSON');
  });

  it('throws "<label> returned a malformed response: ..." when the body fails schema validation', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse({ value: 'not-a-number' }));

    await expect(
      fetchAndParseJson('https://example.com/api', {}, schema, 'Example'),
    ).rejects.toThrow('Example returned a malformed response');
  });

  describe('network-level failure retry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('retries a fetch() throw with backoff and returns the result once a later attempt succeeds', async () => {
      fetchSpy
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(mockSuccessResponse({ value: 42 }));

      const promise = fetchAndParseJson('https://example.com/api', {}, schema, 'Example');
      await jest.advanceTimersByTimeAsync(300);

      await expect(promise).resolves.toEqual({ value: 42 });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('does not retry a non-ok HTTP response — only a thrown fetch() failure', async () => {
      fetchSpy.mockResolvedValue(mockFailureResponse(503, 'upstream down'));

      await expect(
        fetchAndParseJson('https://example.com/api', {}, schema, 'Example'),
      ).rejects.toThrow('Example request failed: 503 upstream down');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('gives up after exhausting retries and throws a controlled error naming the cause', async () => {
      fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

      const promise = fetchAndParseJson('https://example.com/api', {}, schema, 'Example');
      const assertion = expect(promise).rejects.toThrow(
        'Example request failed after retries: fetch failed',
      );
      await jest.advanceTimersByTimeAsync(300);
      await jest.advanceTimersByTimeAsync(800);
      await assertion;

      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('does not retry an aborted/timed-out request — only a genuine TypeError network failure', async () => {
      fetchSpy.mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError'));

      await expect(
        fetchAndParseJson('https://example.com/api', {}, schema, 'Example'),
      ).rejects.toThrow('Example request failed: TimeoutError: The operation was aborted');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
