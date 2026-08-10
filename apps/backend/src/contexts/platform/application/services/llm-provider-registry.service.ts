import { ILlmProvider, OPENROUTER_PROVIDER_NAME } from '../ports/llm-provider.port';

export const LLM_PROVIDER_REGISTRY = Symbol('LlmProviderRegistry');

// Resolved per-request by the caller (e.g. tenant.settings.chatbot?.llmProvider ?? platform
// default), never by this class reading TenantSettings itself — keeps this registry usable
// before the chatbot settings category exists and decoupled from its shape either way
// (docs/discovery/CHATBOT/CHATBOT.md §4).
//
// Framework/env-free by design: platformDefault is resolved once, at module-wiring time
// (platform.module.ts's useFactory reads CHATBOT_LLM_PROVIDER, mirroring the EMAIL_SENDER
// selection pattern in notification.module.ts), and passed in already resolved — this class
// never injects ConfigService or reads process.env itself.
export class LlmProviderRegistry {
  private readonly providers: Map<string, ILlmProvider>;

  constructor(
    private readonly platformDefault: string,
    openRouterProvider: ILlmProvider,
  ) {
    this.providers = new Map([[OPENROUTER_PROVIDER_NAME, openRouterProvider]]);
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
