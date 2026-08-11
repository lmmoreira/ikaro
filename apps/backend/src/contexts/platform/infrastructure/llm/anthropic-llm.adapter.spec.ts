import { ConfigService } from '@nestjs/config';
import { ChatCompletionRequest } from '../../application/ports/llm-provider.port';
import { AnthropicLlmAdapter } from './anthropic-llm.adapter';

function makeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    ANTHROPIC_API_KEY: 'test-api-key',
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

function mockSuccessResponse(overrides: Record<string, unknown> = {}): Response {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        model: 'claude-haiku-4-5',
        content: [{ type: 'text', text: 'We are open 8am to 6pm.' }],
        usage: { input_tokens: 120, output_tokens: 15 },
        ...overrides,
      }),
  } as unknown as Response;
}

describe('AnthropicLlmAdapter', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('calls the Anthropic Messages endpoint with x-api-key and anthropic-version headers', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse());
    const adapter = new AnthropicLlmAdapter(makeConfigService());

    await adapter.complete(makeRequest());

    const [calledUrl, calledOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://api.anthropic.com/v1/messages');
    const headers = calledOptions.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-api-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(calledOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends the default model and max_tokens when no override is set', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse());
    const adapter = new AnthropicLlmAdapter(makeConfigService());

    await adapter.complete(makeRequest({ maxOutputTokens: 250 }));

    const [, calledOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledOptions.body as string);
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.max_tokens).toBe(250);
  });

  it('sends the request-provided model override instead of the default when one is set', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse());
    const adapter = new AnthropicLlmAdapter(makeConfigService());

    await adapter.complete(makeRequest({ model: 'claude-opus-5' }));

    const [, calledOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledOptions.body as string);
    expect(body.model).toBe('claude-opus-5');
  });

  it('never sends a thinking parameter — this adapter relies on the default model not thinking unless enabled', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse());
    const adapter = new AnthropicLlmAdapter(makeConfigService());

    await adapter.complete(makeRequest());

    const [, calledOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledOptions.body as string);
    expect(body.thinking).toBeUndefined();
  });

  it('sends the system prompt as the top-level system field, never inside messages', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse());
    const adapter = new AnthropicLlmAdapter(makeConfigService());

    await adapter.complete(makeRequest({ systemPrompt: 'System instructions.' }));

    const [, calledOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledOptions.body as string);
    expect(body.system).toBe('System instructions.');
    expect(body.messages.some((m: { role: string }) => m.role === 'system')).toBe(false);
  });

  it('assembles messages as history followed by the user message, with no system role', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse());
    const adapter = new AnthropicLlmAdapter(makeConfigService());

    await adapter.complete(
      makeRequest({
        history: [
          { role: 'user', content: 'How much is a wash?' },
          { role: 'assistant', content: 'R$ 60,00.' },
        ],
        userMessage: 'And a polish?',
      }),
    );

    const [, calledOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledOptions.body as string);
    expect(body.messages).toEqual([
      { role: 'user', content: 'How much is a wash?' },
      { role: 'assistant', content: 'R$ 60,00.' },
      { role: 'user', content: 'And a polish?' },
    ]);
  });

  it('maps usage.input_tokens/output_tokens and the response model into ChatCompletionResult', async () => {
    fetchSpy.mockResolvedValue(
      mockSuccessResponse({
        model: 'claude-haiku-4-5',
        content: [{ type: 'text', text: 'We are open 8am to 6pm.' }],
        usage: { input_tokens: 281, output_tokens: 42 },
      }),
    );
    const adapter = new AnthropicLlmAdapter(makeConfigService());

    const result = await adapter.complete(makeRequest());

    expect(result).toEqual({
      text: 'We are open 8am to 6pm.',
      inputTokens: 281,
      outputTokens: 42,
      modelId: 'claude-haiku-4-5',
    });
  });

  it('throws when Anthropic responds with a non-ok status', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    } as unknown as Response);
    const adapter = new AnthropicLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'Anthropic request failed: 401 Unauthorized',
    );
  });

  it('throws a controlled error on an empty content array, instead of an unchecked property access', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse({ content: [] }));
    const adapter = new AnthropicLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'Anthropic returned a malformed response',
    );
  });

  it('throws a controlled error when usage is missing from the response', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          model: 'claude-haiku-4-5',
          content: [{ type: 'text', text: 'We are open 8am to 6pm.' }],
        }),
    } as unknown as Response);
    const adapter = new AnthropicLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'Anthropic returned a malformed response',
    );
  });

  it('throws a controlled error when no content block has type "text"', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse({ content: [{ type: 'tool_use' }] }));
    const adapter = new AnthropicLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'Anthropic returned a malformed response',
    );
  });
});
