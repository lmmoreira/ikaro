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
  DEFAULT_MAX_MESSAGE_LENGTH_CHARS,
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
  ChatbotMessageTooLongError,
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

interface ResolvedSession {
  session: ChatbotSession;
  history: ChatTurn[];
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
    const { tenantId, chatbotSettings } = input;
    const resolvedProviderName = this.llmRegistry.resolveName(chatbotSettings.llmProvider);

    this.enforceMessageLength(input);

    const { session, history } = input.sessionId
      ? await this.resolveExistingSession(input.sessionId, tenantId, chatbotSettings)
      : await this.resolveNewSession(input, resolvedProviderName);

    // Reserve this turn's 2 rows (persist the session with its updated messageCount/
    // lastMessageAt) BEFORE the LLM call, not after. Narrows the concurrent-write race on layers
    // 3 and 4 to the same DB-round-trip-sized window docs/discovery/CHATBOT/CHATBOT.md §8 already
    // accepts for layers 1-2, instead of the full LLM-call-latency window a concurrent burst
    // could previously exploit (PR #360 review finding — the session/messageCount used to be
    // written only in the final save alongside the message rows, after the LLM call returned).
    session.recordMessages(2); // USER + ASSISTANT rows for this turn, recorded as one instant
    await this.txManager.run(() => this.sessionRepo.save(session));

    const provider = this.llmRegistry.resolve(chatbotSettings.llmProvider);
    const maxOutputTokens =
      chatbotSettings.maxOutputTokensPerResponse ?? DEFAULT_MAX_OUTPUT_TOKENS_PER_RESPONSE;

    // Cross-service network I/O — never inside txManager.run() (PR #267 precedent,
    // docs/ENGINEERING_RULES.md § Transactions). All reads/reservation writes above already
    // happened; the two message saves below are the only write left, after this call returns.
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
      this.handleProviderFailure(err, session, resolvedProviderName);
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

    this.tracingPort.setActiveSpanAttributes({
      'chatbot.session_id': session.id,
      'chatbot.model_id': result.modelId,
      'chatbot.provider': resolvedProviderName,
      'chatbot.input_tokens': result.inputTokens,
      'chatbot.output_tokens': result.outputTokens,
    });

    await this.txManager.run(async () => {
      await this.messageRepo.save(userMessageRow);
      await this.messageRepo.save(assistantMessageRow);
    });

    return { sessionId: session.id, reply: result.text };
  }

  // Layer 5 — checked first, uniformly, before any DB read (docs/14-API_CONTRACTS.md UC-033 A3).
  // The BFF DTO layer (S09) is the primary UX-facing check; this is the real backstop so this use
  // case is never reachable with an oversized message from any caller — a generous static Zod
  // ceiling at the backend DTO layer alone left the tenant's real, often-smaller resolved cap
  // unenforced for any caller reaching this endpoint directly (PR #360 review).
  private enforceMessageLength(input: SendChatMessageUseCaseInput): void {
    const maxMessageLength =
      input.chatbotSettings.maxMessageLengthChars ?? DEFAULT_MAX_MESSAGE_LENGTH_CHARS;
    if (input.userMessage.length > maxMessageLength) {
      this.rejectAndThrow(
        'message_too_long',
        input.sessionId,
        () => new ChatbotMessageTooLongError(),
      );
    }
  }

  private async resolveExistingSession(
    sessionId: string,
    tenantId: string,
    chatbotSettings: ChatbotSettings,
  ): Promise<ResolvedSession> {
    const existing = await this.sessionRepo.findById(sessionId, tenantId);
    if (!existing) throw new ChatbotSessionNotFoundError(sessionId);
    const session = existing;

    // Layer 4, checked against session.messageCount (already-persisted, incrementally maintained
    // by recordMessages() in execute()) rather than counting live chatbot_messages rows — avoids
    // loading the whole conversation just to check its length (PR #360 review, performance), and
    // checks capacity for BOTH rows this turn writes, not just whether the count is already at
    // cap — exact for every configured value, not just even ones (PR #360 review, correctness:
    // the previous `>= maxMessages` check could overshoot by 1 on an odd cap, since it only
    // rejected once already at/over cap, not when this turn would cross it).
    const maxMessages =
      chatbotSettings.maxMessagesPerConversation ?? DEFAULT_MAX_MESSAGES_PER_CONVERSATION;
    if (session.messageCount + 2 > maxMessages) {
      session.markCapped();
      await this.txManager.run(() => this.sessionRepo.save(session));
      this.rejectAndThrow('message_cap', session.id, () => new ChatbotMessageCapReachedError());
    }

    const maxHistory =
      chatbotSettings.maxHistoryMessagesSentToLlm ?? DEFAULT_MAX_HISTORY_MESSAGES_SENT_TO_LLM;
    const recentMessages = await this.messageRepo.findRecentBySession(
      sessionId,
      tenantId,
      maxHistory,
    );

    return { session, history: recentMessages.map(toChatTurn) };
  }

  private async resolveNewSession(
    input: SendChatMessageUseCaseInput,
    resolvedProviderName: string,
  ): Promise<ResolvedSession> {
    const { tenantId, clientIp, chatbotSettings } = input;
    const now = new Date();
    const conversationDate = utcDateToLocalDate(now, input.timezone);

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

    await this.enforcePlatformBackstops(resolvedProviderName);

    const session = ChatbotSession.create({ tenantId, clientIp, conversationDate });
    return { session, history: [] };
  }

  // Platform-wide backstops (layers 9-10) — new-session creation only, per
  // docs/discovery/CHATBOT/CHATBOT.md §8.9: "already-open conversations remain bounded by their
  // own per-session caps regardless" (not the global breaker). Checking these on every message of
  // an already-open conversation contradicted this canonical text (PR #360 review — reverting the
  // M19-S05 story-discovery decision to check on every message).
  private async enforcePlatformBackstops(resolvedProviderName: string): Promise<void> {
    const globalSpendLimitUsd = new Decimal(
      this.config.get<string>('CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD', '25'),
    );
    const todaySpend = await this.messageRepo.sumCostUsdSince(new Date(startOfDayUTC(todayUTC())));
    if (todaySpend.greaterThanOrEqualTo(globalSpendLimitUsd)) {
      this.rejectAndThrow(
        'global_spend_limit',
        undefined,
        () => new ChatbotGlobalSpendLimitReachedError(),
      );
    }

    const balance = await this.balanceRepo.findByProvider(resolvedProviderName);
    const minBalanceUsd = new Decimal(
      this.config.get<string>('CHATBOT_MIN_PROVIDER_BALANCE_USD', DEFAULT_MIN_PROVIDER_BALANCE_USD),
    );
    if (balance?.remainingUsd.lessThan(minBalanceUsd)) {
      this.rejectAndThrow(
        'provider_balance_low',
        undefined,
        () => new ChatbotProviderBalanceLowError(),
      );
    }
  }

  // The real cause is logged server-side only — never embedded in the public Problem Details
  // response, which could otherwise leak upstream vendor diagnostic details (PR #360 review).
  private handleProviderFailure(
    err: unknown,
    session: ChatbotSession,
    resolvedProviderName: string,
  ): never {
    this.logger.error(
      'Chatbot LLM provider call failed',
      err instanceof Error ? err.stack : undefined,
      { sessionId: session.id, provider: resolvedProviderName },
    );
    this.tracingPort.setActiveSpanAttributes({
      'chatbot.session_id': session.id,
      'chatbot.provider': resolvedProviderName,
      'chatbot.cap_rejected': 'provider_unavailable',
    });
    throw new ChatbotProviderUnavailableError();
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
