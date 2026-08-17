import { Inject, Injectable, Optional } from '@nestjs/common';
import { defaultTracingPort, ITracingPort } from '@ikaro/observability';
import { Decimal } from 'decimal.js';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  APPLICATION_CONFIG,
  IApplicationConfig,
} from '../../../../shared/ports/application-config.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import type { ChatbotSettings } from '../../../../shared/value-objects/tenant-settings-data';
import { DEFAULT_MAX_OUTPUT_TOKENS_PER_RESPONSE } from '../../chatbot.constants';
import { ChatbotMessage } from '../../domain/chatbot-message.aggregate';
import { ChatbotSession } from '../../domain/chatbot-session.aggregate';
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
import {
  enforceMessageLength,
  handleProviderFailure,
  resolveExistingSession,
  resolveNewSession,
} from './chatbot-session-resolution.helpers';
import { ChatbotCapCheckDeps } from './chatbot-cap-check.types';

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
    @Inject(APPLICATION_CONFIG) private readonly config: IApplicationConfig,
    @Optional() private readonly tracingPort: ITracingPort = defaultTracingPort,
  ) {}

  private get capDeps(): ChatbotCapCheckDeps {
    return {
      sessionRepo: this.sessionRepo,
      messageRepo: this.messageRepo,
      balanceRepo: this.balanceRepo,
      txManager: this.txManager,
      config: this.config,
      tracingPort: this.tracingPort,
      logger: this.logger,
    };
  }

  async execute(input: SendChatMessageUseCaseInput): Promise<SendChatMessageUseCaseResult> {
    const { tenantId, chatbotSettings } = input;
    const resolvedProviderName = this.llmRegistry.resolveName(chatbotSettings.llmProvider);

    enforceMessageLength(this.capDeps, input);

    const isNewSession = !input.sessionId;
    const { session, history } = input.sessionId
      ? await resolveExistingSession(this.capDeps, input.sessionId, tenantId, chatbotSettings)
      : await resolveNewSession(this.capDeps, input, resolvedProviderName);

    // Reserve this turn's 2 rows (persist the session with its updated messageCount/
    // lastMessageAt) BEFORE the LLM call, not after. Narrows the concurrent-write race on layers
    // 3 and 4 to the same DB-round-trip-sized window docs/discovery/CHATBOT/CHATBOT.md §8 already
    // accepts for layers 1-2, instead of the full LLM-call-latency window a concurrent burst
    // could previously exploit (PR #360 review finding — the session/messageCount used to be
    // written only in the final save alongside the message rows, after the LLM call returned).
    session.recordMessages(2); // USER + ASSISTANT rows for this turn, recorded as one instant
    await this.txManager.run(() => this.sessionRepo.save(session));

    const result = await this.completeOrHandleFailure(
      input,
      session,
      chatbotSettings,
      history,
      resolvedProviderName,
      isNewSession,
    );

    const { userMessageRow, assistantMessageRow } = this.buildMessageRows(
      session,
      tenantId,
      input,
      result,
    );

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
      // UC-034 condition (c)'s success signal — see the matching failure-path write above.
      await this.balanceRepo.recordCallOutcome(resolvedProviderName, 'SUCCESS', new Date());
    });

    return { sessionId: session.id, reply: result.text };
  }

  // Cross-service network I/O — never inside txManager.run() (PR #267 precedent,
  // docs/ENGINEERING_RULES.md § Transactions). All reads/reservation writes above already
  // happened; the two message saves after this call returns are the only write left.
  private async completeOrHandleFailure(
    input: SendChatMessageUseCaseInput,
    session: ChatbotSession,
    chatbotSettings: ChatbotSettings,
    history: ChatTurn[],
    resolvedProviderName: string,
    isNewSession: boolean,
  ): Promise<ChatCompletionResult> {
    const provider = this.llmRegistry.resolve(chatbotSettings.llmProvider);
    const maxOutputTokens =
      chatbotSettings.maxOutputTokensPerResponse ?? DEFAULT_MAX_OUTPUT_TOKENS_PER_RESPONSE;

    try {
      return await provider.complete({
        systemPrompt: input.systemPrompt,
        history,
        userMessage: input.userMessage,
        maxOutputTokens,
        model: chatbotSettings.llmModel,
      });
    } catch (err: unknown) {
      await this.txManager.run(async () => {
        if (isNewSession) {
          // A brand-new session has no chatbot_messages rows yet (those are only written after
          // a successful complete() call below), so deleting it entirely is safe — and
          // necessary: releasing messageCount alone still leaves the row itself counted by
          // chatbot_sessions' COUNT-based daily/per-IP/concurrency caps, silently burning the
          // tenant's budget for a conversation that never happened (cross-tool review finding,
          // 2026-08-12 — releaseMessages(2) narrowed the overshoot but didn't close it).
          await this.sessionRepo.deleteById(session.id, input.tenantId);
        } else {
          // An existing session already has real prior messages and already counted toward the
          // caps when it was first created — release only this turn's reservation, keep the row.
          session.releaseMessages(2);
          await this.sessionRepo.save(session);
        }
        // UC-034 condition (c)'s only failure signal — a genuine provider.complete() failure,
        // never a cap/volume rejection (those all throw earlier in this method, before this
        // catch block is ever reached). docs/13-DATABASE_SCHEMA.md's "Write discipline" note.
        await this.balanceRepo.recordCallOutcome(resolvedProviderName, 'FAILURE', new Date());
      });
      handleProviderFailure(this.capDeps, err, session, resolvedProviderName);
    }
  }

  private buildMessageRows(
    session: ChatbotSession,
    tenantId: string,
    input: SendChatMessageUseCaseInput,
    result: ChatCompletionResult,
  ): { userMessageRow: ChatbotMessage; assistantMessageRow: ChatbotMessage } {
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
    return { userMessageRow, assistantMessageRow };
  }
}
