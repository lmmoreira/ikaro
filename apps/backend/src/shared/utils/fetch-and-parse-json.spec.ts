import { z } from 'zod';

// The retry/connect-timeout mechanics now live inside undici's own Agent + retry interceptor
// (GET_RESILIENT_DISPATCHER / POST_RESILIENT_DISPATCHER in fetch-and-parse-json.ts) — a
// well-tested third-party primitive, not something this suite re-verifies. These tests cover what
// our own code is responsible for: that fetchAndParseJson wires up those dispatchers with the
// intended configuration (including that GET and POST get deliberately different error-code
// eligibility), that it picks the right one per request method, and that it correctly handles
// whatever undiciFetch resolves/rejects with.
const mockAgentCompose = jest
  .fn()
  .mockReturnValueOnce('mock-get-dispatcher')
  .mockReturnValueOnce('mock-post-dispatcher');
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
// module evaluation order), which would run fetch-and-parse-json.ts's module-level dispatcher
// construction — and thus `new Agent(...)` — before those mocks exist. require() runs at this
// exact line instead, after they're initialized.
type FetchAndParseJsonModule = typeof import('./fetch-and-parse-json');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- load the module after jest.mock('undici') so module initialization uses the mocked transport
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

function retryConfigFor(method: 'GET' | 'POST'): Record<string, unknown> {
  const call = mockRetryInterceptor.mock.calls.find(
    ([config]) => (config as { methods: string[] }).methods[0] === method,
  );
  if (!call) {
    throw new Error(`no interceptors.retry() call found for methods: ['${method}']`);
  }
  return call[0] as Record<string, unknown>;
}

describe('fetchAndParseJson', () => {
  beforeEach(() => {
    mockUndiciFetch.mockReset();
  });

  it('constructs a single shared Agent with a short connect timeout, and composes both dispatchers off it', () => {
    expect(mockAgentCtor).toHaveBeenCalledTimes(1);
    expect(mockAgentCtor).toHaveBeenCalledWith({ connectTimeout: 2000 });
    expect(mockAgentCompose).toHaveBeenCalledTimes(2);
    expect(mockAgentCompose).toHaveBeenCalledWith('mock-retry-interceptor');
  });

  it("gives GET undici's full default error-code set (plus the connect-timeout code) and no status-based retry", () => {
    expect(retryConfigFor('GET')).toEqual(
      expect.objectContaining({
        maxRetries: 2,
        methods: ['GET'],
        statusCodes: [],
        errorCodes: expect.arrayContaining([
          'ECONNRESET',
          'EPIPE',
          'UND_ERR_SOCKET',
          'UND_ERR_CONNECT_TIMEOUT',
        ]),
      }),
    );
  });

  it('restricts POST to only provably pre-send error codes, excluding ECONNRESET/EPIPE/UND_ERR_SOCKET', () => {
    const postConfig = retryConfigFor('POST');

    expect(postConfig).toEqual(
      expect.objectContaining({
        maxRetries: 2,
        methods: ['POST'],
        statusCodes: [],
      }),
    );
    expect(postConfig['errorCodes']).toEqual(
      expect.arrayContaining(['ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT']),
    );
    expect(postConfig['errorCodes']).not.toEqual(
      expect.arrayContaining(['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET']),
    );
  });

  it('calls undici fetch with the GET dispatcher for a GET request', async () => {
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse({ value: 42 }));

    const result = await fetchAndParseJson(
      'https://example.com/api',
      { method: 'GET' },
      schema,
      'Example',
    );

    expect(mockUndiciFetch).toHaveBeenCalledWith('https://example.com/api', {
      method: 'GET',
      dispatcher: 'mock-get-dispatcher',
    });
    expect(result).toEqual({ value: 42 });
  });

  it('calls undici fetch with the POST dispatcher for a POST request', async () => {
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse({ value: 42 }));

    await fetchAndParseJson(
      'https://example.com/api',
      { method: 'POST', body: '{}' },
      schema,
      'Example',
    );

    expect(mockUndiciFetch).toHaveBeenCalledWith('https://example.com/api', {
      method: 'POST',
      body: '{}',
      dispatcher: 'mock-post-dispatcher',
    });
  });

  it('defaults to the GET dispatcher when no method is given', async () => {
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse({ value: 42 }));

    await fetchAndParseJson('https://example.com/api', {}, schema, 'Example');

    expect(mockUndiciFetch).toHaveBeenCalledWith('https://example.com/api', {
      dispatcher: 'mock-get-dispatcher',
    });
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
