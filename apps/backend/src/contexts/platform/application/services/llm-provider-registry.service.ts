import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILlmProvider, OPENROUTER_LLM_PROVIDER } from '../ports/llm-provider.port';

export const LLM_PROVIDER_REGISTRY = Symbol('LlmProviderRegistry');

const DEFAULT_PROVIDER = 'openrouter';

// Resolved per-request by the caller (e.g. tenant.settings.chatbot?.llmProvider ?? platform
// default), never by this class reading TenantSettings itself — keeps this registry usable
// before the chatbot settings category exists and decoupled from its shape either way
// (docs/discovery/CHATBOT/CHATBOT.md §4).
@Injectable()
export class LlmProviderRegistry {
  private readonly providers: Map<string, ILlmProvider>;
  private readonly platformDefault: string;

  constructor(
    config: ConfigService,
    @Inject(OPENROUTER_LLM_PROVIDER) openRouterProvider: ILlmProvider,
  ) {
    this.platformDefault = config.get<string>('CHATBOT_LLM_PROVIDER', DEFAULT_PROVIDER);
    this.providers = new Map([['openrouter', openRouterProvider]]);
  }

  resolve(providerNameOverride?: string): ILlmProvider {
    const providerName = providerNameOverride ?? this.platformDefault;
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Unknown LLM provider: ${providerName}`);
    }
    return provider;
  }
}
