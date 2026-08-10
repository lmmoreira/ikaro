import { FakeLlmProviderBuilder } from '../../../../test/builders/platform/fake-llm-provider.builder';
import { ILlmProvider, OPENROUTER_PROVIDER_NAME } from '../ports/llm-provider.port';
import { LlmProviderRegistry } from './llm-provider-registry.service';

describe('LlmProviderRegistry', () => {
  let openRouterProvider: ILlmProvider;

  beforeEach(() => {
    openRouterProvider = new FakeLlmProviderBuilder().withText('openrouter says hi').build();
  });

  it('resolves to the platform default when no override is passed — the all-unset case', () => {
    const registry = new LlmProviderRegistry(OPENROUTER_PROVIDER_NAME, openRouterProvider);

    expect(registry.resolve()).toBe(openRouterProvider);
  });

  it('resolves to the explicit override when one is passed, regardless of the platform default', () => {
    const registry = new LlmProviderRegistry(OPENROUTER_PROVIDER_NAME, openRouterProvider);

    expect(registry.resolve(OPENROUTER_PROVIDER_NAME)).toBe(openRouterProvider);
  });

  it('throws for an unknown provider name', () => {
    const registry = new LlmProviderRegistry(OPENROUTER_PROVIDER_NAME, openRouterProvider);

    expect(() => registry.resolve('anthropic')).toThrow('Unknown LLM provider: anthropic');
  });
});
