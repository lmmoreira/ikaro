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
});
