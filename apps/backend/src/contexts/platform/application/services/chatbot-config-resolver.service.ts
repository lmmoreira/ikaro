import { Inject, Injectable, Optional } from '@nestjs/common';
import { defaultTracingPort, ITracingPort } from '@ikaro/observability';
import {
  TENANT_ACCESS_PORT,
  type TenantAccessPort,
} from '../../../../shared/ports/tenant-access.port';
import type { ChatbotSettings } from '../../../../shared/value-objects/tenant-settings-data';
import {
  CHATBOT_TIER_CONFIG,
  type ChatbotCaps,
  type ChatbotMaxPrice,
  type ChatbotTier,
} from '../../chatbot.constants';
import { ChatbotSettingsValidator } from '../../domain/value-objects/validators/chatbot-settings.validator';

export interface ChatbotConfigResolverInput {
  tenantId: string;
  /** The tenant's own `chatbot` settings: the operator's overrides, empty for almost every tenant. */
  chatbotSettings: ChatbotSettings;
}

export interface ResolvedChatbotConfig {
  /** False for a suspended tenant or one whose plan has no `CHATBOT` item: the chatbot is inert. */
  entitled: boolean;
  tier: ChatbotTier;
  provider: string;
  model: string;
  /** Set only while `model` is the tier's own, so a tier ceiling never reaches an override model. */
  maxPrice?: ChatbotMaxPrice;
  caps: ChatbotCaps;
  /** True when the tenant's own settings changed the provider, the model or a cap. */
  overrideApplied: boolean;
  /**
   * Why the tenant's stored provider/model override was ignored (the tier's values were used
   * instead), or `null`. The caller logs it: this service stays silent, because the status
   * endpoint resolves on every hotsite page load.
   */
  overrideProblem: string | null;
}

// A stored JSON null is the same as an absent key.
const isSet = (value: unknown): boolean => value !== undefined && value !== null;

const CAP_KEYS: readonly (keyof ChatbotCaps)[] = [
  'maxConversationsPerDay',
  'maxConversationsPerIpPerDay',
  'maxConcurrentConversations',
  'maxMessagesPerConversation',
  'maxMessageLengthChars',
  'maxHistoryMessagesSentToLlm',
  'maxOutputTokensPerResponse',
];

/**
 * M26-S21 — resolves, per request, the provider, model and caps one tenant's chatbot runs with.
 * Resolution order, per value: the tenant's own `chatbot` override (an operator decision, set by a
 * direct database edit: no API writes it), else the tier's constants (`CHATBOT_TIER_CONFIG`). The
 * tier comes from `TenantAccessPort` (`features: [{ key: 'CHATBOT', tier }]`); a trial tenant, an
 * unknown tier and the fail-open answer all resolve to `BASIC`.
 *
 * The provider/model part of an override is judged here, where it is read
 * (`ChatbotSettingsValidator.findLlmOverrideProblem`): `provider` + `model`, or `model` alone (the
 * provider stays the tier's). A provider alone, an unknown provider, or `anthropic` / `openai`
 * with a model they do not price correctly is ignored as a pair, the tier's values are used and
 * `overrideProblem` says why, so a bad stored row never fails a chat.
 */
@Injectable()
export class ChatbotConfigResolver {
  constructor(
    @Inject(TENANT_ACCESS_PORT) private readonly tenantAccess: TenantAccessPort,
    @Optional() private readonly tracingPort: ITracingPort = defaultTracingPort,
  ) {}

  async resolve(input: ChatbotConfigResolverInput): Promise<ResolvedChatbotConfig> {
    const { tenantId, chatbotSettings } = input;
    const access = await this.tenantAccess.getAccess(tenantId);
    const feature = access.features.find((item) => item.key === 'CHATBOT');
    const entitled = access.operational && feature !== undefined;
    const tier: ChatbotTier = feature?.tier === 'PLUS' ? 'PLUS' : 'BASIC';
    const tierConfig = CHATBOT_TIER_CONFIG[tier];

    const overrideProblem = ChatbotSettingsValidator.findLlmOverrideProblem(chatbotSettings);
    const provider = overrideProblem
      ? tierConfig.provider
      : (chatbotSettings.llmProvider ?? tierConfig.provider);
    const model = overrideProblem
      ? tierConfig.model
      : (chatbotSettings.llmModel ?? tierConfig.model);
    const overrideApplied =
      (!overrideProblem && isSet(chatbotSettings.llmModel)) ||
      CAP_KEYS.some((key) => isSet(chatbotSettings[key]));
    const ownModel = provider === tierConfig.provider && model === tierConfig.model;

    this.tracingPort.setActiveSpanAttributes({
      'chatbot.tier': tier,
      'chatbot.override': overrideApplied,
    });

    return {
      entitled,
      tier,
      provider,
      model,
      maxPrice: ownModel ? tierConfig.maxPrice : undefined,
      caps: this.resolveCaps(chatbotSettings, tierConfig.caps),
      overrideApplied,
      overrideProblem,
    };
  }

  private resolveCaps(settings: ChatbotSettings, tierCaps: ChatbotCaps): ChatbotCaps {
    return {
      maxConversationsPerDay: settings.maxConversationsPerDay ?? tierCaps.maxConversationsPerDay,
      maxConversationsPerIpPerDay:
        settings.maxConversationsPerIpPerDay ?? tierCaps.maxConversationsPerIpPerDay,
      maxConcurrentConversations:
        settings.maxConcurrentConversations ?? tierCaps.maxConcurrentConversations,
      maxMessagesPerConversation:
        settings.maxMessagesPerConversation ?? tierCaps.maxMessagesPerConversation,
      maxMessageLengthChars: settings.maxMessageLengthChars ?? tierCaps.maxMessageLengthChars,
      maxHistoryMessagesSentToLlm:
        settings.maxHistoryMessagesSentToLlm ?? tierCaps.maxHistoryMessagesSentToLlm,
      maxOutputTokensPerResponse:
        settings.maxOutputTokensPerResponse ?? tierCaps.maxOutputTokensPerResponse,
    };
  }
}
