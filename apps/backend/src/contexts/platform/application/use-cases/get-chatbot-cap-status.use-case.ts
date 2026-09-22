import { Inject, Injectable } from '@nestjs/common';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import type { ChatbotSettings } from '../../../../shared/value-objects/tenant-settings-data';
import { DEFAULT_MAX_CONVERSATIONS_PER_DAY } from '../../chatbot.constants';
import {
  CHATBOT_SESSION_REPOSITORY,
  IChatbotSessionRepository,
} from '../ports/chatbot-session-repository.port';

export interface GetChatbotCapStatusUseCaseInput {
  tenantId: string;
  chatbotSettings: ChatbotSettings;
  /** Tenant's businessHours.timezone — for computing the tenant-local conversation_date bucket. */
  timezone: string;
}

export interface GetChatbotCapStatusUseCaseResult {
  dailyCapReachedToday: boolean;
}

/**
 * UC-027 A5 — powers the CHATBOT module config screen's own red banner. Reuses the identical
 * per-tenant daily-cap COUNT query SendChatMessageUseCase's cap enforcement (layer 1) and
 * GetChatbotStatusUseCase's own condition (a) already run against chatbot_sessions — not a new
 * counting mechanism. Deliberately narrow: only the daily-cap condition is reported here;
 * concurrency cap, global spend breaker, and provider balance floor stay covered by the
 * visitor-facing "not available" widget state (UC-034) only, since they aren't specific to — or
 * actionable by — one tenant (docs/14-API_CONTRACTS.md § Chatbot Cap Status).
 */
@Injectable()
export class GetChatbotCapStatusUseCase {
  constructor(
    @Inject(CHATBOT_SESSION_REPOSITORY) private readonly sessionRepo: IChatbotSessionRepository,
  ) {}

  async execute(input: GetChatbotCapStatusUseCaseInput): Promise<GetChatbotCapStatusUseCaseResult> {
    const { tenantId, chatbotSettings, timezone } = input;
    const conversationDate = utcDateToLocalDate(new Date(), timezone);
    const maxPerDay = chatbotSettings.maxConversationsPerDay ?? DEFAULT_MAX_CONVERSATIONS_PER_DAY;
    const dailyCount = await this.sessionRepo.countByTenantAndDate(tenantId, conversationDate);
    return { dailyCapReachedToday: dailyCount >= maxPerDay };
  }
}
