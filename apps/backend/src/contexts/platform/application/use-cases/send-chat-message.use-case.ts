import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { defaultTracingPort, ITracingPort } from '@ikaro/observability';
import { Decimal } from 'decimal.js';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  startOfDayUTC,
  todayUTC,
  utcDateToLocalDate,
} from '../../../../shared/utils/calendar-date';
import type { ChatbotSettings } from '../../../../shared/value-objects/tenant-settings-data';
import {
  DEFAULT_MAX_CONCURRENT_CONVERSATIONS,
  DEFAULT_MAX_CONVERSATIONS_PER_DAY,
  DEFAULT_MAX_CONVERSATIONS_PER_IP_PER_DAY,
  DEFAULT_MAX_HISTORY_MESSAGES_SENT_TO_LLM,
  DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
  DEFAULT_MAX_OUTPUT_TOKENS_PER_RESPONSE,
} from '../../chatbot.constants';
import { ChatbotMessage } from '../../domain/chatbot-message.aggregate';
import { ChatbotSession } from '../../domain/chatbot-session.aggregate';
import {
  ChatbotConcurrencyCapReachedError,
  ChatbotDailyCapReachedError,
  ChatbotGlobalSpendLimitReachedError,
  ChatbotMessageCapReachedError,
  ChatbotProviderBalanceLowError,
  ChatbotProviderUnavailableError,
  ChatbotSessionNotFoundError,
} from '../../domain/errors/platform-domain.error';
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
import { ChatCompletionResult, ChatTurn } from '../ports/llm-provider.port';
import {
  LLM_PROVIDER_REGISTRY,
  LlmProviderRegistry,
} from '../services/llm-provider-registry.service';

// docs/discovery/CHATBOT/CHATBOT.md §8.10 — proposed default, confirmed during M19-S04
// story-discovery. Read as a plain env var (fast to bump during an incident, same reasoning as
// CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD below) once S06 builds the balance-floor pre-flight check;
// this use case only needs the already-polled chatbot_provider_balance row (S08), not the env var.
const DEFAULT_MIN_PROVIDER_BALANCE_USD = '2';

// Cap layer 3's live-ness proxy window (docs/discovery/CHATBOT/CHATBOT.md §8): a session counts
// as concurrently active if it received a message in the last 2 minutes. Not tenant-configurable.
const CONCURRENCY_WINDOW_MS = 2 * 60 * 1000;

export interface SendChatMessageUseCaseInput {
  tenantId: string;
  clientIp: string;
  sessionId?: string;
  systemPrompt: string;
  userMessage: string;
  chatbotSettings: ChatbotSettings;
  /** Tenant's businessHours.timezone — for computing the tenant-local conversation_date bucket. */
  timezone: string;
}

export interface SendChatMessageUseCaseResult {
  sessionId: string;
  reply: string;
}

@Injectable()
export class SendChatMessageUseCase {
  private readonly logger = new AppLogger(SendChatMessageUseCase.name);

  constructor(
    @Inject(CHATBOT_SESSION_REPOSITORY) private readonly sessionRepo: IChatbotSessionRepository,
    @Inject(CHATBOT_MESSAGE_REPOSITORY) private readonly messageRepo: IChatbotMessageRepository,
    @Inject(CHATBOT_PROVIDER_BALANCE_REPOSITORY)
    private readonly balanceRepo: IChatbotProviderBalanceRepository,
    @Inject(LLM_PROVIDER_REGISTRY) private readonly llmRegistry: LlmProviderRegistry,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly config: ConfigService,
    @Optional() private readonly tracingPort: ITracingPort = defaultTracingPort,
  ) {}

  async execute(input: SendChatMessageUseCaseInput): Promise<SendChatMessageUseCaseResult> {
    const { tenantId, clientIp, chatbotSettings } = input;
    const now = new Date();
    const conversationDate = utcDateToLocalDate(now, input.timezone);

    let session: ChatbotSession;
    let history: ChatTurn[];

    if (input.sessionId) {
      const existing = await this.sessionRepo.findById(input.sessionId, tenantId);
      if (!existing) throw new ChatbotSessionNotFoundError(input.sessionId);
      session = existing;

      const messages = await this.messageRepo.findBySession(input.sessionId, tenantId);
      const maxMessages =
        chatbotSettings.maxMessagesPerConversation ?? DEFAULT_MAX_MESSAGES_PER_CONVERSATION;
      // Checked before this turn's 2 rows (USER+ASSISTANT) are written, so an odd maxMessages
      // can be exceeded by 1 on the turn that crosses it — exact for every even value, which is
      // the only value this cap is ever documented as ("N exchanges" — docs/21 §7). It's an
      // Ikaro-only override with no API-layer validation, so an odd value is a direct-DB typo,
      // not a real caller-facing scenario worth adding a pre-write check for.
      if (messages.length >= maxMessages) {
        session.markCapped();
        await this.txManager.run(() => this.sessionRepo.save(session));
        this.rejectAndThrow('message_cap', session.id, () => new ChatbotMessageCapReachedError());
      }

      const maxHistory =
        chatbotSettings.maxHistoryMessagesSentToLlm ?? DEFAULT_MAX_HISTORY_MESSAGES_SENT_TO_LLM;
      history = messages.slice(-maxHistory).map(toChatTurn);
    } else {
      const maxPerDay = chatbotSettings.maxConversationsPerDay ?? DEFAULT_MAX_CONVERSATIONS_PER_DAY;
      const dailyCount = await this.sessionRepo.countByTenantAndDate(tenantId, conversationDate);
      if (dailyCount >= maxPerDay) {
        this.rejectAndThrow('daily_cap', undefined, () => new ChatbotDailyCapReachedError());
      }

      const maxPerIpPerDay =
        chatbotSettings.maxConversationsPerIpPerDay ?? DEFAULT_MAX_CONVERSATIONS_PER_IP_PER_DAY;
      const ipDailyCount = await this.sessionRepo.countByTenantIpAndDate(
        tenantId,
        clientIp,
        conversationDate,
      );
      if (ipDailyCount >= maxPerIpPerDay) {
        this.rejectAndThrow('daily_cap', undefined, () => new ChatbotDailyCapReachedError());
      }

      const maxConcurrent =
        chatbotSettings.maxConcurrentConversations ?? DEFAULT_MAX_CONCURRENT_CONVERSATIONS;
      const concurrentCount = await this.sessionRepo.countActiveSince(
        tenantId,
        new Date(now.getTime() - CONCURRENCY_WINDOW_MS),
      );
      if (concurrentCount >= maxConcurrent) {
        this.rejectAndThrow(
          'concurrency_cap',
          undefined,
          () => new ChatbotConcurrencyCapReachedError(),
        );
      }

      session = ChatbotSession.create({ tenantId, clientIp, conversationDate });
      history = [];
    }

    // Platform-wide backstops (layers 9-10) — checked on every message, not just new-session
    // creation: UC-033 A6 is explicit these can trip "between messages of an already-open
    // conversation," and only gating new sessions would let an already-open conversation keep
    // spending after the breaker trips, defeating the "bounds the sum of all of them" purpose
    // docs/discovery/CHATBOT/CHATBOT.md §8 describes (M19-S05 story-discovery, 2026-08-12).
    const globalSpendLimitUsd = new Decimal(
      this.config.get<string>('CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD', '25'),
    );
    const todaySpend = await this.messageRepo.sumCostUsdSince(new Date(startOfDayUTC(todayUTC())));
    if (todaySpend.greaterThanOrEqualTo(globalSpendLimitUsd)) {
      this.rejectAndThrow(
        'global_spend_limit',
        session.id,
        () => new ChatbotGlobalSpendLimitReachedError(),
      );
    }

    const resolvedProviderName = this.llmRegistry.resolveName(chatbotSettings.llmProvider);
    const balance = await this.balanceRepo.findByProvider(resolvedProviderName);
    const minBalanceUsd = new Decimal(
      this.config.get<string>('CHATBOT_MIN_PROVIDER_BALANCE_USD', DEFAULT_MIN_PROVIDER_BALANCE_USD),
    );
    if (balance && balance.remainingUsd.lessThan(minBalanceUsd)) {
      this.rejectAndThrow(
        'provider_balance_low',
        session.id,
        () => new ChatbotProviderBalanceLowError(),
      );
    }

    const provider = this.llmRegistry.resolve(chatbotSettings.llmProvider);
    const maxOutputTokens =
      chatbotSettings.maxOutputTokensPerResponse ?? DEFAULT_MAX_OUTPUT_TOKENS_PER_RESPONSE;

    // Cross-service network I/O — never inside txManager.run() (PR #267 precedent,
    // docs/ENGINEERING_RULES.md § Transactions). All reads above already happened; the two
    // message saves + session save below are the only writes, batched in one transaction after
    // this call returns.
    let result: ChatCompletionResult;
    try {
      result = await provider.complete({
        systemPrompt: input.systemPrompt,
        history,
        userMessage: input.userMessage,
        maxOutputTokens,
        model: chatbotSettings.llmModel,
      });
    } catch (err: unknown) {
      this.tracingPort.setActiveSpanAttributes({
        'chatbot.session_id': session.id,
        'chatbot.provider': resolvedProviderName,
        'chatbot.cap_rejected': 'provider_unavailable',
      });
      throw new ChatbotProviderUnavailableError(err instanceof Error ? err.message : String(err));
    }

    const userMessageRow = ChatbotMessage.create({
      sessionId: session.id,
      tenantId,
      role: 'USER',
      content: input.userMessage,
      inputTokens: 0,
      outputTokens: 0,
      modelId: result.modelId,
      costUsd: new Decimal(0),
    });
    const assistantMessageRow = ChatbotMessage.create({
      sessionId: session.id,
      tenantId,
      role: 'ASSISTANT',
      content: result.text,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      modelId: result.modelId,
      costUsd: result.costUsd,
    });
    session.recordMessage();
    session.recordMessage();

    this.tracingPort.setActiveSpanAttributes({
      'chatbot.session_id': session.id,
      'chatbot.model_id': result.modelId,
      'chatbot.provider': resolvedProviderName,
      'chatbot.input_tokens': result.inputTokens,
      'chatbot.output_tokens': result.outputTokens,
    });

    await this.txManager.run(async () => {
      await this.sessionRepo.save(session);
      await this.messageRepo.save(userMessageRow);
      await this.messageRepo.save(assistantMessageRow);
    });

    return { sessionId: session.id, reply: result.text };
  }

  /** Structured log (AppThrottlerGuard's own logging pattern) + span attribute + throw, in one
   * place so every cap-rejection site does all three identically. */
  private rejectAndThrow(
    capLayer: string,
    sessionId: string | undefined,
    buildError: () => Error,
  ): never {
    this.logger.warn('Chatbot cap rejected request', { capLayer, sessionId });
    this.tracingPort.setActiveSpanAttributes({
      'chatbot.cap_rejected': capLayer,
      ...(sessionId ? { 'chatbot.session_id': sessionId } : {}),
    });
    throw buildError();
  }
}

function toChatTurn(message: ChatbotMessage): ChatTurn {
  return { role: message.role === 'USER' ? 'user' : 'assistant', content: message.content };
}
