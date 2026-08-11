import { ConfigService } from '@nestjs/config';
import { ChatCompletionRequest } from '../../application/ports/llm-provider.port';
import { OpenAiLlmAdapter } from './openai-llm.adapter';

function makeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    OPENAI_API_KEY: 'test-api-key',
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
        model: 'gpt-5.6-luna',
        choices: [{ message: { content: 'We are open 8am to 6pm.' } }],
        usage: { prompt_tokens: 120, completion_tokens: 15 },
        ...overrides,
      }),
  } as unknown as Response;
}

describe('OpenAiLlmAdapter', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('calls the OpenAI chat completions endpoint with the default model, max_completion_tokens, and bearer auth', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse());
    const adapter = new OpenAiLlmAdapter(makeConfigService());

    await adapter.complete(makeRequest({ maxOutputTokens: 250 }));

    const [calledUrl, calledOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect((calledOptions.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-api-key',
    );
    const body = JSON.parse(calledOptions.body as string);
    expect(body.model).toBe('gpt-5.6-luna');
    expect(body.max_completion_tokens).toBe(250);
    expect(body.max_tokens).toBeUndefined();
    expect(calledOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends the request-provided model override instead of the default when one is set', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse());
    const adapter = new OpenAiLlmAdapter(makeConfigService());

    await adapter.complete(makeRequest({ model: 'gpt-5.6-terra' }));

    const [, calledOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledOptions.body as string);
    expect(body.model).toBe('gpt-5.6-terra');
  });

  it('assembles messages as system prompt, then history, then the user message', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse());
    const adapter = new OpenAiLlmAdapter(makeConfigService());

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

    const [, calledOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledOptions.body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'System instructions.' },
      { role: 'user', content: 'How much is a wash?' },
      { role: 'assistant', content: 'R$ 60,00.' },
      { role: 'user', content: 'And a polish?' },
    ]);
  });

  it('maps usage.prompt_tokens/completion_tokens and the response model into ChatCompletionResult', async () => {
    fetchSpy.mockResolvedValue(
      mockSuccessResponse({
        model: 'gpt-5.6-luna',
        choices: [{ message: { content: 'We are open 8am to 6pm.' } }],
        usage: { prompt_tokens: 281, completion_tokens: 42 },
      }),
    );
    const adapter = new OpenAiLlmAdapter(makeConfigService());

    const result = await adapter.complete(makeRequest());

    expect(result).toEqual({
      text: 'We are open 8am to 6pm.',
      inputTokens: 281,
      outputTokens: 42,
      modelId: 'gpt-5.6-luna',
    });
  });

  it('throws when OpenAI responds with a non-ok status', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    } as unknown as Response);
    const adapter = new OpenAiLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'OpenAI request failed: 401 Unauthorized',
    );
  });

  it('throws a controlled error on an empty choices array, instead of an unchecked property access', async () => {
    fetchSpy.mockResolvedValue(mockSuccessResponse({ choices: [] }));
    const adapter = new OpenAiLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'OpenAI returned a malformed response',
    );
  });

  it('throws a controlled error when usage is missing from the response', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          model: 'gpt-5.6-luna',
          choices: [{ message: { content: 'We are open 8am to 6pm.' } }],
        }),
    } as unknown as Response);
    const adapter = new OpenAiLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'OpenAI returned a malformed response',
    );
  });

  it('throws a controlled error when message content is not a string', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          model: 'gpt-5.6-luna',
          choices: [{ message: { content: null } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
    } as unknown as Response);
    const adapter = new OpenAiLlmAdapter(makeConfigService());

    await expect(adapter.complete(makeRequest())).rejects.toThrow(
      'OpenAI returned a malformed response',
    );
  });
});
