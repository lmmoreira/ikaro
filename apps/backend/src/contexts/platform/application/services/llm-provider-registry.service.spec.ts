import { FakeLlmProviderBuilder } from '../../../../test/builders/platform/fake-llm-provider.builder';
import {
  ANTHROPIC_PROVIDER_NAME,
  FAKE_PROVIDER_NAME,
  ILlmProvider,
  OPENAI_PROVIDER_NAME,
  OPENROUTER_PROVIDER_NAME,
} from '../ports/llm-provider.port';
import { LlmProviderRegistry } from './llm-provider-registry.service';

describe('LlmProviderRegistry', () => {
  let openRouterProvider: ILlmProvider;
  let anthropicProvider: ILlmProvider;
  let openAiProvider: ILlmProvider;
  let fakeProvider: ILlmProvider;

  beforeEach(() => {
    openRouterProvider = new FakeLlmProviderBuilder().withText('openrouter says hi').build();
    anthropicProvider = new FakeLlmProviderBuilder().withText('anthropic says hi').build();
    openAiProvider = new FakeLlmProviderBuilder().withText('openai says hi').build();
    fakeProvider = new FakeLlmProviderBuilder().withText('fake says hi').build();
  });

  function buildRegistry(forceFake = false): LlmProviderRegistry {
    return new LlmProviderRegistry(
      forceFake,
      openRouterProvider,
      anthropicProvider,
      openAiProvider,
      fakeProvider,
    );
  }

  it.each([
    [OPENROUTER_PROVIDER_NAME, () => openRouterProvider],
    [ANTHROPIC_PROVIDER_NAME, () => anthropicProvider],
    [OPENAI_PROVIDER_NAME, () => openAiProvider],
    [FAKE_PROVIDER_NAME, () => fakeProvider],
  ])('resolves the %s provider by name', (name, expected) => {
    expect(buildRegistry().resolve(name)).toBe(expected());
  });

  it('throws for an unknown provider name', () => {
    expect(() => buildRegistry().resolve('vertex-ai')).toThrow('Unknown LLM provider: vertex-ai');
  });

  it('resolveName returns the requested name as is', () => {
    expect(buildRegistry().resolveName(ANTHROPIC_PROVIDER_NAME)).toBe(ANTHROPIC_PROVIDER_NAME);
  });

  describe('with CHATBOT_LLM_FAKE on (forceFake)', () => {
    it.each([OPENROUTER_PROVIDER_NAME, ANTHROPIC_PROVIDER_NAME, OPENAI_PROVIDER_NAME])(
      'resolves %s to the fake provider, whatever name the caller asks for',
      (name) => {
        expect(buildRegistry(true).resolve(name)).toBe(fakeProvider);
      },
    );

    it('resolveName reports the fake provider, so the balance row and the trace match the call', () => {
      expect(buildRegistry(true).resolveName(OPENROUTER_PROVIDER_NAME)).toBe(FAKE_PROVIDER_NAME);
    });
  });
});
