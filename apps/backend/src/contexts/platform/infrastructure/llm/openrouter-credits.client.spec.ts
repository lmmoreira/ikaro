import { ConfigService } from '@nestjs/config';
import { OpenRouterCreditsClient } from './openrouter-credits.client';

function makeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    OPENROUTER_MANAGEMENT_API_KEY: 'test-management-key',
    ...overrides,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

function mockSuccessResponse(overrides: Record<string, unknown> = {}): Response {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        data: { total_credits: 100.5, total_usage: 25.75, ...overrides },
      }),
  } as unknown as Response;
}

function mockFailureResponse(status: number, text = 'unauthorized'): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

describe('OpenRouterCreditsClient', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('calls GET /api/v1/credits with bearer auth using the management key, not the completions key', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse());
    const client = new OpenRouterCreditsClient(makeConfigService());

    await client.getRemainingBalanceUsd();

    const [calledUrl, calledOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://openrouter.ai/api/v1/credits');
    expect(calledOptions.method).toBe('GET');
    expect((calledOptions.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-management-key',
    );
    expect(calledOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns total_credits minus total_usage as the remaining balance', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse({ total_credits: 100.5, total_usage: 25.75 }));
    const client = new OpenRouterCreditsClient(makeConfigService());

    const balance = await client.getRemainingBalanceUsd();

    expect(balance.toNumber()).toBe(74.75);
  });

  it('throws on a non-ok HTTP response', async () => {
    fetchSpy.mockResolvedValue(mockFailureResponse(401, 'invalid management key'));
    const client = new OpenRouterCreditsClient(makeConfigService());

    await expect(client.getRemainingBalanceUsd()).rejects.toThrow(
      'OpenRouter credits request failed: 401',
    );
  });

  it('throws on invalid JSON in the response body', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    } as unknown as Response);
    const client = new OpenRouterCreditsClient(makeConfigService());

    await expect(client.getRemainingBalanceUsd()).rejects.toThrow(
      'OpenRouter credits returned a malformed response: invalid JSON',
    );
  });

  it('throws when the response shape does not match the documented schema', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { total_credits: 'not-a-number' } }),
    } as unknown as Response);
    const client = new OpenRouterCreditsClient(makeConfigService());

    await expect(client.getRemainingBalanceUsd()).rejects.toThrow(
      'OpenRouter credits returned a malformed response',
    );
  });
});
