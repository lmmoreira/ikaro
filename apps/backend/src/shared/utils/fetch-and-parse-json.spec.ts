import { z } from 'zod';

// The retry/connect-timeout mechanics now live inside undici's own Agent + retry interceptor
// (RESILIENT_DISPATCHER in fetch-and-parse-json.ts) — a well-tested third-party primitive, not
// something this suite re-verifies. These tests cover what our own code is responsible for: that
// fetchAndParseJson wires up that dispatcher with the intended configuration, and that it
// correctly handles whatever undiciFetch resolves/rejects with (a connect failure that survived
// every retry, a non-ok response, a malformed body, a schema mismatch).
const mockAgentCompose = jest.fn().mockReturnValue('mock-dispatcher');
const mockAgentCtor = jest.fn().mockImplementation(() => ({ compose: mockAgentCompose }));
const mockRetryInterceptor = jest.fn().mockReturnValue('mock-retry-interceptor');
const mockUndiciFetch = jest.fn();

jest.mock('undici', () => ({
  // A real function declaration (not an arrow function) — must support `new Agent(...)`, which
  // arrow functions structurally can't.
  Agent: function MockAgent(...args: unknown[]) {
    return mockAgentCtor(...args);
  },
  fetch: (...args: unknown[]) => mockUndiciFetch(...args),
  interceptors: { retry: (...args: unknown[]) => mockRetryInterceptor(...args) },
}));

// A plain `import` is hoisted above this file's own top-level `const mock...` declarations (ES
// module evaluation order), which would run fetch-and-parse-json.ts's module-level
// RESILIENT_DISPATCHER construction — and thus `new Agent(...)` — before those mocks exist.
// require() runs at this exact line instead, after they're initialized.
type FetchAndParseJsonModule = typeof import('./fetch-and-parse-json');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate, see comment above
const { fetchAndParseJson }: FetchAndParseJsonModule = require('./fetch-and-parse-json');

const schema = z.object({ value: z.number() });

function mockSuccessResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function mockFailureResponse(status: number, text = 'server error') {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(text),
  };
}

describe('fetchAndParseJson', () => {
  beforeEach(() => {
    mockUndiciFetch.mockReset();
  });

  it('constructs the shared dispatcher with a short connect timeout, POST enabled, connect-class error codes, and no status-based retry', () => {
    expect(mockAgentCtor).toHaveBeenCalledWith({ connectTimeout: 2000 });
    expect(mockRetryInterceptor).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 2,
        methods: ['GET', 'POST'],
        statusCodes: [],
        errorCodes: expect.arrayContaining(['UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET']),
      }),
    );
    expect(mockAgentCompose).toHaveBeenCalledWith('mock-retry-interceptor');
  });

  it('calls undici fetch with the given url/init plus the shared dispatcher, returning the schema-validated body', async () => {
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse({ value: 42 }));

    const result = await fetchAndParseJson(
      'https://example.com/api',
      { method: 'GET' },
      schema,
      'Example',
    );

    expect(mockUndiciFetch).toHaveBeenCalledWith('https://example.com/api', {
      method: 'GET',
      dispatcher: 'mock-dispatcher',
    });
    expect(result).toEqual({ value: 42 });
  });

  it('throws "<label> request failed: <cause>" when undici fetch itself rejects (connect failure survived every retry)', async () => {
    mockUndiciFetch.mockRejectedValue(new Error('connect ETIMEDOUT'));

    await expect(
      fetchAndParseJson('https://example.com/api', {}, schema, 'Example'),
    ).rejects.toThrow('Example request failed: connect ETIMEDOUT');
  });

  it('throws "<label> request failed: <status> <text>" on a non-ok response', async () => {
    mockUndiciFetch.mockResolvedValue(mockFailureResponse(503, 'upstream down'));

    await expect(
      fetchAndParseJson('https://example.com/api', {}, schema, 'Example'),
    ).rejects.toThrow('Example request failed: 503 upstream down');
  });

  it('throws "<label> returned a malformed response: invalid JSON: <raw text>" when the body is not valid JSON', async () => {
    mockUndiciFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html>502 Bad Gateway</html>'),
    });

    await expect(
      fetchAndParseJson('https://example.com/api', {}, schema, 'Example'),
    ).rejects.toThrow(
      'Example returned a malformed response: invalid JSON: <html>502 Bad Gateway</html>',
    );
  });

  it('truncates a long malformed body to 500 chars in the error message', async () => {
    const longBody = 'x'.repeat(600);
    mockUndiciFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(longBody),
    });

    await expect(
      fetchAndParseJson('https://example.com/api', {}, schema, 'Example'),
    ).rejects.toThrow(`Example returned a malformed response: invalid JSON: ${'x'.repeat(500)}`);
  });

  it('throws "<label> returned a malformed response: ..." when the body fails schema validation', async () => {
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse({ value: 'not-a-number' }));

    await expect(
      fetchAndParseJson('https://example.com/api', {}, schema, 'Example'),
    ).rejects.toThrow('Example returned a malformed response');
  });
});
