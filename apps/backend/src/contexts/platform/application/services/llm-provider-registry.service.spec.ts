import { FakeLlmProviderBuilder } from '../../../../test/builders/platform/fake-llm-provider.builder';
import {
  ANTHROPIC_PROVIDER_NAME,
  ILlmProvider,
  OPENAI_PROVIDER_NAME,
  OPENROUTER_PROVIDER_NAME,
} from '../ports/llm-provider.port';
import { LlmProviderRegistry } from './llm-provider-registry.service';

describe('LlmProviderRegistry', () => {
  let openRouterProvider: ILlmProvider;
  let anthropicProvider: ILlmProvider;
  let openAiProvider: ILlmProvider;

  beforeEach(() => {
    openRouterProvider = new FakeLlmProviderBuilder().withText('openrouter says hi').build();
    anthropicProvider = new FakeLlmProviderBuilder().withText('anthropic says hi').build();
    openAiProvider = new FakeLlmProviderBuilder().withText('openai says hi').build();
  });

  function buildRegistry(platformDefault: string): LlmProviderRegistry {
    return new LlmProviderRegistry(
      platformDefault,
      openRouterProvider,
      anthropicProvider,
      openAiProvider,
    );
  }

  it('resolves to the platform default when no override is passed — the all-unset case', () => {
    const registry = buildRegistry(OPENROUTER_PROVIDER_NAME);

    expect(registry.resolve()).toBe(openRouterProvider);
  });

  it('resolves to the explicit override when one is passed, regardless of the platform default', () => {
    const registry = buildRegistry(OPENROUTER_PROVIDER_NAME);

    expect(registry.resolve(OPENROUTER_PROVIDER_NAME)).toBe(openRouterProvider);
  });

  it('resolves the anthropic override to a real adapter instance', () => {
    const registry = buildRegistry(OPENROUTER_PROVIDER_NAME);

    expect(registry.resolve(ANTHROPIC_PROVIDER_NAME)).toBe(anthropicProvider);
  });

  it('resolves the openai override to a real adapter instance', () => {
    const registry = buildRegistry(OPENROUTER_PROVIDER_NAME);

    expect(registry.resolve(OPENAI_PROVIDER_NAME)).toBe(openAiProvider);
  });

  it('throws for an unknown provider name', () => {
    const registry = buildRegistry(OPENROUTER_PROVIDER_NAME);

    expect(() => registry.resolve('vertex-ai')).toThrow('Unknown LLM provider: vertex-ai');
  });

  it('resolveName returns the platform default when no override is passed', () => {
    const registry = buildRegistry(OPENROUTER_PROVIDER_NAME);

    expect(registry.resolveName()).toBe(OPENROUTER_PROVIDER_NAME);
  });

  it("resolveName returns the explicit override, matching resolve()'s own resolution", () => {
    const registry = buildRegistry(OPENROUTER_PROVIDER_NAME);

    expect(registry.resolveName(ANTHROPIC_PROVIDER_NAME)).toBe(ANTHROPIC_PROVIDER_NAME);
  });
});
