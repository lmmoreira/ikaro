import { Inject, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  APPLICATION_CONFIG,
  IApplicationConfig,
} from '../../../../shared/ports/application-config.port';
import {
  startOfDayUTC,
  todayUTC,
  utcDateToLocalDate,
} from '../../../../shared/utils/calendar-date';
import type { ChatbotSettings } from '../../../../shared/value-objects/tenant-settings-data';
import {
  DEFAULT_MAX_CONCURRENT_CONVERSATIONS,
  DEFAULT_MAX_CONVERSATIONS_PER_DAY,
} from '../../chatbot.constants';
import {
  CHATBOT_MESSAGE_REPOSITORY,
  IChatbotMessageRepository,
} from '../ports/chatbot-message-repository.port';
import {
  CHATBOT_PROVIDER_BALANCE_REPOSITORY,
  IChatbotProviderBalanceRepository,
} from '../ports/chatbot-provider-balance-repository.port';
import {
  CHATBOT_SESSION_REPOSITORY,
  IChatbotSessionRepository,
} from '../ports/chatbot-session-repository.port';
import {
  LLM_PROVIDER_REGISTRY,
  LlmProviderRegistry,
} from '../services/llm-provider-registry.service';

// Cap layer 3's live-ness proxy window (docs/discovery/CHATBOT/CHATBOT.md §8) — same window
// SendChatMessageUseCase's own concurrency check uses. Not tenant-configurable.
const CONCURRENCY_WINDOW_MS = 2 * 60 * 1000;

export interface GetChatbotStatusUseCaseInput {
  tenantId: string;
  chatbotSettings: ChatbotSettings;
  /** Tenant's businessHours.timezone — for computing the tenant-local conversation_date bucket. */
  timezone: string;
}

export interface GetChatbotStatusUseCaseResult {
  available: boolean;
}

/**
 * UC-034 — evaluates the 5 "not available" conditions for the tenant resolved from the request.
 * Pure read: every condition is a live lookup against data this codebase already maintains for
 * other reasons (S05's cap enforcement, S08's balance poll) — never a live external call, never
 * a write of its own.
 */
@Injectable()
export class GetChatbotStatusUseCase {
  constructor(
    @Inject(CHATBOT_SESSION_REPOSITORY) private readonly sessionRepo: IChatbotSessionRepository,
    @Inject(CHATBOT_MESSAGE_REPOSITORY) private readonly messageRepo: IChatbotMessageRepository,
    @Inject(CHATBOT_PROVIDER_BALANCE_REPOSITORY)
    private readonly balanceRepo: IChatbotProviderBalanceRepository,
    @Inject(LLM_PROVIDER_REGISTRY) private readonly llmRegistry: LlmProviderRegistry,
    @Inject(APPLICATION_CONFIG) private readonly config: IApplicationConfig,
  ) {}

  async execute(input: GetChatbotStatusUseCaseInput): Promise<GetChatbotStatusUseCaseResult> {
    const { tenantId, chatbotSettings, timezone } = input;
    const resolvedProviderName = this.llmRegistry.resolveName(chatbotSettings.llmProvider);
    const now = new Date();

    // (a) Tenant's daily cap already exhausted.
    const conversationDate = utcDateToLocalDate(now, timezone);
    const maxPerDay = chatbotSettings.maxConversationsPerDay ?? DEFAULT_MAX_CONVERSATIONS_PER_DAY;
    const dailyCount = await this.sessionRepo.countByTenantAndDate(tenantId, conversationDate);
    if (dailyCount >= maxPerDay) return { available: false };

    // (b) Tenant's concurrency cap already exhausted.
    const maxConcurrent =
      chatbotSettings.maxConcurrentConversations ?? DEFAULT_MAX_CONCURRENT_CONVERSATIONS;
    const concurrentCount = await this.sessionRepo.countActiveSince(
      tenantId,
      new Date(now.getTime() - CONCURRENCY_WINDOW_MS),
    );
    if (concurrentCount >= maxConcurrent) return { available: false };

    // (c) and (e) both read the same row — one query serves both conditions.
    const balance = await this.balanceRepo.findByProvider(resolvedProviderName);

    // (c) Resolved provider failing a health check.
    const cooldownMinutes = Number(
      this.config.getOrThrow('CHATBOT_PROVIDER_HEALTH_COOLDOWN_MINUTES'),
    );
    if (balance && !balance.isHealthy(cooldownMinutes, now)) return { available: false };

    // (d) Global daily spend circuit breaker already tripped.
    const globalSpendLimitUsd = new Decimal(
      this.config.getOrThrow('CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD'),
    );
    const todaySpend = await this.messageRepo.sumCostUsdSince(new Date(startOfDayUTC(todayUTC())));
    if (todaySpend.greaterThanOrEqualTo(globalSpendLimitUsd)) return { available: false };

    // (e) Resolved provider's balance floor already tripped. remainingUsd is null until S08's
    // first poll for this provider, and always null for a provider with no prepaid-balance
    // concept (Anthropic/OpenAI) — treated as "not tripped", never as a comparison failure.
    const minBalanceUsd = new Decimal(this.config.getOrThrow('CHATBOT_MIN_PROVIDER_BALANCE_USD'));
    if (balance?.remainingUsd?.lessThan(minBalanceUsd)) return { available: false };

    return { available: true };
  }
}
