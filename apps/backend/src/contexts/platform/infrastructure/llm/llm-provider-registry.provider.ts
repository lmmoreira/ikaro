import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ANTHROPIC_LLM_PROVIDER,
  FAKE_LLM_PROVIDER,
  ILlmProvider,
  OPENAI_LLM_PROVIDER,
  OPENROUTER_LLM_PROVIDER,
} from '../../application/ports/llm-provider.port';
import {
  LLM_PROVIDER_REGISTRY,
  LlmProviderRegistry,
} from '../../application/services/llm-provider-registry.service';

// Kept out of platform.module.ts so that file stays under the 250-line cap.
export const llmProviderRegistryProvider: Provider = {
  provide: LLM_PROVIDER_REGISTRY,
  useFactory: (
    config: ConfigService,
    openRouterProvider: ILlmProvider,
    anthropicProvider: ILlmProvider,
    openAiProvider: ILlmProvider,
    fakeProvider: ILlmProvider,
  ) =>
    new LlmProviderRegistry(
      config.get<boolean>('CHATBOT_LLM_FAKE', false),
      openRouterProvider,
      anthropicProvider,
      openAiProvider,
      fakeProvider,
    ),
  inject: [
    ConfigService,
    OPENROUTER_LLM_PROVIDER,
    ANTHROPIC_LLM_PROVIDER,
    OPENAI_LLM_PROVIDER,
    FAKE_LLM_PROVIDER,
  ],
};
