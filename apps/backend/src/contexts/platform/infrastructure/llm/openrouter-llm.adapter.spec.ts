import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ChatCompletionRequest } from '../../application/ports/llm-provider.port';

// fetch-and-parse-json.ts (imported transitively via OpenRouterLlmAdapter below) constructs a
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

type OpenRouterLlmAdapterModule = typeof import('./openrouter-llm.adapter');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after jest.mock above
const { OpenRouterLlmAdapter }: OpenRouterLlmAdapterModule = require('./openrouter-llm.adapter');

function makeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    OPENROUTER_API_KEY: 'test-api-key',
    ...overrides,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

function makeRequest(overrides: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest {
  return {
    systemPrompt: 'You are a helpful assistant.',
    history: [],
    userMessage: 'What are your hours?',
    maxOutputTokens: 300,
    ...overrides,
  };
}

function mockSuccessResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    text: () =>
      Promise.resolve(
        JSON.stringify({
          model: 'deepseek/deepseek-v4-flash-0731',
          choices: [{ message: { content: 'We are open 8am to 6pm.' } }],
          usage: { prompt_tokens: 120, completion_tokens: 15, cost: 0.0000135 },
          ...overrides,
        }),
      ),
  };
}

describe('OpenRouterLlmAdapter', () => {
  beforeEach(() => {
    mockUndiciFetch.mockReset();
  });

  it('always sends reasoning.effort "none" — regression test for the silent-expensive-billing trap', async () => {
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse());
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    await adapter.complete(makeRequest());

    const [, calledOptions] = mockUndiciFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledOptions.body as string);
    expect(body.reasoning).toEqual({ effort: 'none' });
  });

  it('sorts by throughput, requires every provider to honor all request parameters, ignores atlas-cloud, with a generous max_price backstop', async () => {
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse());
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    await adapter.complete(makeRequest());

    const [, calledOptions] = mockUndiciFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledOptions.body as string);
    expect(body.provider).toEqual({
      sort: 'throughput',
      max_price: { prompt: 10, completion: 50 },
      require_parameters: true,
      ignore: ['atlas-cloud'],
    });
  });

  it('calls the OpenRouter chat completions endpoint with the model, max_tokens, and bearer auth', async () => {
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse());
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    await adapter.complete(makeRequest({ maxOutputTokens: 250 }));

    const [calledUrl, calledOptions] = mockUndiciFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((calledOptions.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-api-key',
    );
    const body = JSON.parse(calledOptions.body as string);
    expect(body.model).toBe('deepseek/deepseek-v4-flash-0731');
    expect(body.max_tokens).toBe(250);
    expect(calledOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends the request-provided model override instead of the default when one is set', async () => {
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse());
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    await adapter.complete(makeRequest({ model: 'deepseek/deepseek-v4-flash-thinking' }));

    const [, calledOptions] = mockUndiciFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledOptions.body as string);
    expect(body.model).toBe('deepseek/deepseek-v4-flash-thinking');
  });

  it('assembles messages as system prompt, then history, then the user message', async () => {
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse());
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    await adapter.complete(
      makeRequest({
        systemPrompt: 'System instructions.',
        history: [
          { role: 'user', content: 'How much is a wash?' },
          { role: 'assistant', content: 'R$ 60,00.' },
        ],
        userMessage: 'And a polish?',
      }),
    );

    const [, calledOptions] = mockUndiciFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledOptions.body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'System instructions.' },
      { role: 'user', content: 'How much is a wash?' },
      { role: 'assistant', content: 'R$ 60,00.' },
      { role: 'user', content: 'And a polish?' },
    ]);
  });

  it('maps usage.prompt_tokens/completion_tokens/cost and the response model into ChatCompletionResult', async () => {
    mockUndiciFetch.mockResolvedValue(
      mockSuccessResponse({
        model: 'deepseek/deepseek-v4-flash-0731',
        choices: [{ message: { content: 'We are open 8am to 6pm.' } }],
        usage: { prompt_tokens: 281, completion_tokens: 42, cost: 0.0000328 },
      }),
    );
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    const result = await adapter.complete(makeRequest());

    expect(result).toEqual({
      text: 'We are open 8am to 6pm.',
      inputTokens: 281,
      outputTokens: 42,
      modelId: 'deepseek/deepseek-v4-flash-0731',
      costUsd: new Decimal(0.0000328),
    });
  });

  it('reads costUsd straight from usage.cost — the provider-confirmed value, never self-computed', async () => {
    mockUndiciFetch.mockResolvedValue(
      mockSuccessResponse({ usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.00042 } }),
    );
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    const result = await adapter.complete(makeRequest());

    expect(result.costUsd).toEqual(new Decimal(0.00042));
  });

  it('throws a controlled error when usage.cost is missing — a documented-as-always-present field going absent is treated as a malformed response, not silently priced at zero', async () => {
    mockUndiciFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            model: 'deepseek/deepseek-v4-flash-0731',
            choices: [{ message: { content: 'We are open 8am to 6pm.' } }],
            usage: { prompt_tokens: 120, completion_tokens: 15 },
          }),
        ),
    });
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'OpenRouter returned a malformed response',
    );
  });

  it('throws a controlled error when the response body is not valid JSON, instead of an unhandled SyntaxError', async () => {
    mockUndiciFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html>502 Bad Gateway</html>'),
    });
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'OpenRouter returned a malformed response: invalid JSON: <html>502 Bad Gateway</html>',
    );
  });

  it('throws when OpenRouter responds with a non-ok status', async () => {
    mockUndiciFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'OpenRouter request failed: 401 Unauthorized',
    );
  });

  it('throws a controlled error on an empty choices array, instead of an unchecked property access', async () => {
    mockUndiciFetch.mockResolvedValue(
      mockSuccessResponse({
        choices: [],
      }),
    );
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'OpenRouter returned a malformed response',
    );
  });

  it('throws a controlled error when usage is missing from the response', async () => {
    mockUndiciFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            model: 'deepseek/deepseek-v4-flash-0731',
            choices: [{ message: { content: 'We are open 8am to 6pm.' } }],
          }),
        ),
    });
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'OpenRouter returned a malformed response',
    );
  });

  it('debug-logs only request metadata — never the message content, API key, or knowledgeText it may carry', async () => {
    const debugSpy = jest.spyOn(AppLogger.prototype, 'debug').mockImplementation();
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse());
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    await adapter.complete(
      makeRequest({
        systemPrompt: 'System instructions with tenant knowledgeText baked in.',
        history: [{ role: 'user', content: 'How much is a wash?' }],
        userMessage: 'And a polish?',
        maxOutputTokens: 250,
      }),
    );

    expect(debugSpy).toHaveBeenCalledWith('OpenRouter request payload', {
      model: 'deepseek/deepseek-v4-flash-0731',
      maxOutputTokens: 250,
      messageCount: 3,
      provider: {
        sort: 'throughput',
        max_price: { prompt: 10, completion: 50 },
        require_parameters: true,
        ignore: ['atlas-cloud'],
      },
    });
    const loggedArgs = debugSpy.mock.calls[0];
    expect(JSON.stringify(loggedArgs)).not.toContain('test-api-key');
    expect(JSON.stringify(loggedArgs)).not.toContain('How much is a wash?');
    expect(JSON.stringify(loggedArgs)).not.toContain('knowledgeText');
    debugSpy.mockRestore();
  });

  it('throws a controlled error when message content is not a string', async () => {
    mockUndiciFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            model: 'deepseek/deepseek-v4-flash-0731',
            choices: [{ message: { content: null } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
        ),
    });
    const adapter = new OpenRouterLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'OpenRouter returned a malformed response',
    );
  });
});
