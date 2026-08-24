import { ConfigService } from '@nestjs/config';

// fetch-and-parse-json.ts (imported transitively via OpenRouterCreditsClient below) constructs a
// shared undici Agent + retry interceptor at module-load time — mock undici before that module
// ever loads, same reasoning as fetch-and-parse-json.spec.ts.
const mockAgentCompose = jest.fn().mockReturnValue('mock-dispatcher');
const mockAgentCtor = jest.fn().mockImplementation(() => ({ compose: mockAgentCompose }));
const mockRetryInterceptor = jest.fn().mockReturnValue('mock-retry-interceptor');
const mockUndiciFetch = jest.fn();

jest.mock('undici', () => ({
  Agent: function MockAgent(...args: unknown[]) {
    return mockAgentCtor(...args);
  },
  fetch: (...args: unknown[]) => mockUndiciFetch(...args),
  interceptors: { retry: (...args: unknown[]) => mockRetryInterceptor(...args) },
}));

const creditsClientModule =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- load the module after jest.mock('undici') so module initialization uses the mocked transport
  require('./openrouter-credits.client') as typeof import('./openrouter-credits.client');
const { OpenRouterCreditsClient } = creditsClientModule;

function makeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    OPENROUTER_MANAGEMENT_API_KEY: 'test-management-key',
    ...overrides,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

function mockSuccessResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    text: () =>
      Promise.resolve(
        JSON.stringify({
          data: { total_credits: 100.5, total_usage: 25.75, ...overrides },
        }),
      ),
  };
}

function mockFailureResponse(status: number, text = 'unauthorized') {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(text),
  };
}

describe('OpenRouterCreditsClient', () => {
  beforeEach(() => {
    mockUndiciFetch.mockReset();
  });

  it('calls GET /api/v1/credits with bearer auth using the management key, not the completions key', async () => {
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse());
    const client = new OpenRouterCreditsClient(makeConfigService());

    await client.getRemainingBalanceUsd();

    const [calledUrl, calledOptions] = mockUndiciFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://openrouter.ai/api/v1/credits');
    expect(calledOptions.method).toBe('GET');
    expect((calledOptions.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-management-key',
    );
    expect(calledOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns total_credits minus total_usage as the remaining balance', async () => {
    mockUndiciFetch.mockResolvedValue(
      mockSuccessResponse({ total_credits: 100.5, total_usage: 25.75 }),
    );
    const client = new OpenRouterCreditsClient(makeConfigService());

    const balance = await client.getRemainingBalanceUsd();

    expect(balance.toNumber()).toBe(74.75);
  });

  it('throws on a non-ok HTTP response', async () => {
    mockUndiciFetch.mockResolvedValue(mockFailureResponse(401, 'invalid management key'));
    const client = new OpenRouterCreditsClient(makeConfigService());

    await expect(client.getRemainingBalanceUsd()).rejects.toThrow(
      'OpenRouter credits request failed: 401',
    );
  });

  it('throws on invalid JSON in the response body', async () => {
    mockUndiciFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html>502 Bad Gateway</html>'),
    });
    const client = new OpenRouterCreditsClient(makeConfigService());

    await expect(client.getRemainingBalanceUsd()).rejects.toThrow(
      'OpenRouter credits returned a malformed response: invalid JSON: <html>502 Bad Gateway</html>',
    );
  });

  it('throws when the response shape does not match the documented schema', async () => {
    mockUndiciFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: { total_credits: 'not-a-number' } })),
    });
    const client = new OpenRouterCreditsClient(makeConfigService());

    await expect(client.getRemainingBalanceUsd()).rejects.toThrow(
      'OpenRouter credits returned a malformed response',
    );
  });
});
