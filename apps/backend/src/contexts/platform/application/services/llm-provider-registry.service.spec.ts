import { ConfigService } from '@nestjs/config';
import { FakeLlmProviderBuilder } from '../../../../test/builders/platform/fake-llm-provider.builder';
import { ILlmProvider } from '../ports/llm-provider.port';
import { LlmProviderRegistry } from './llm-provider-registry.service';

function makeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = { ...overrides };
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe('LlmProviderRegistry', () => {
  let openRouterProvider: ILlmProvider;

  beforeEach(() => {
    openRouterProvider = new FakeLlmProviderBuilder().withResponse('openrouter says hi').build();
  });

  it('resolves to the platform default (openrouter) when nothing is set — the all-unset case', () => {
    const registry = new LlmProviderRegistry(makeConfigService(), openRouterProvider);

    expect(registry.resolve()).toBe(openRouterProvider);
  });

  it('resolves to the platform default read from CHATBOT_LLM_PROVIDER when no override is passed', () => {
    const registry = new LlmProviderRegistry(
      makeConfigService({ CHATBOT_LLM_PROVIDER: 'openrouter' }),
      openRouterProvider,
    );

    expect(registry.resolve()).toBe(openRouterProvider);
  });

  it('resolves to the explicit override when one is passed, regardless of the platform default', () => {
    const registry = new LlmProviderRegistry(
      makeConfigService({ CHATBOT_LLM_PROVIDER: 'openrouter' }),
      openRouterProvider,
    );

    expect(registry.resolve('openrouter')).toBe(openRouterProvider);
  });

  it('throws for an unknown provider name', () => {
    const registry = new LlmProviderRegistry(makeConfigService(), openRouterProvider);

    expect(() => registry.resolve('anthropic')).toThrow('Unknown LLM provider: anthropic');
  });
});
