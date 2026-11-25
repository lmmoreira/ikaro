import {
  ANTHROPIC_PROVIDER_NAME,
  FAKE_PROVIDER_NAME,
  ILlmProvider,
  OPENAI_PROVIDER_NAME,
  OPENROUTER_PROVIDER_NAME,
} from '../ports/llm-provider.port';

export const LLM_PROVIDER_REGISTRY = Symbol('LlmProviderRegistry');

// The provider *name* is resolved per request by the caller (ChatbotConfigResolver: a
// tenant override, else the tenant's tier), never by this class reading TenantSettings itself —
// keeps this registry decoupled from the chatbot settings shape
// (docs/ENGINEERING_RULES_BACKEND.md § OpenRouter chatbot).
//
// Framework/env-free by design: `forceFake` is resolved once, at module-wiring time
// (platform.module.ts's useFactory reads CHATBOT_LLM_FAKE, mirroring the EMAIL_SENDER selection
// pattern in notification.module.ts), and passed in already resolved — this class never injects
// ConfigService or reads process.env itself. When true every request resolves to the fake
// provider whatever name the caller asks for (local runs and the E2E stack).
export class LlmProviderRegistry {
  private readonly providers: Map<string, ILlmProvider>;

  constructor(
    private readonly forceFake: boolean,
    openRouterProvider: ILlmProvider,
    anthropicProvider: ILlmProvider,
    openAiProvider: ILlmProvider,
    fakeProvider: ILlmProvider,
  ) {
    this.providers = new Map([
      [OPENROUTER_PROVIDER_NAME, openRouterProvider],
      [ANTHROPIC_PROVIDER_NAME, anthropicProvider],
      [OPENAI_PROVIDER_NAME, openAiProvider],
      [FAKE_PROVIDER_NAME, fakeProvider],
    ]);
  }

  resolve(providerName: string): ILlmProvider {
    const resolvedName = this.resolveName(providerName);
    const provider = this.providers.get(resolvedName);
    if (!provider) {
      throw new Error(`Unknown LLM provider: ${resolvedName}`);
    }
    return provider;
  }

  /** The resolved provider *name* for a requested one — same resolution as resolve(), for
   * callers that need the name itself (the provider balance row, a `chatbot.provider` trace
   * attribute), not an ILlmProvider instance. */
  resolveName(providerName: string): string {
    return this.forceFake ? FAKE_PROVIDER_NAME : providerName;
  }
}
