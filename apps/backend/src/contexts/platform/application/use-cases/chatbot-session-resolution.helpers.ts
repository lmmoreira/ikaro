import { Decimal } from 'decimal.js';
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
} from '../../domain/errors/chatbot-domain.error';
import { ChatTurn } from '../ports/llm-provider.port';
import { SendChatMessageUseCaseInput } from './send-chat-message.use-case';
import { ChatbotCapCheckDeps, ResolvedSession } from './chatbot-cap-check.types';

// Cap layer 3's live-ness proxy window (docs/discovery/CHATBOT/CHATBOT.md §8): a session counts
// as concurrently active if it received a message in the last 2 minutes. Not tenant-configurable.
const CONCURRENCY_WINDOW_MS = 2 * 60 * 1000;

// Layer 5 — checked first, uniformly, before any DB read (docs/14-API_CONTRACTS.md UC-033 A3).
// The BFF DTO layer (S09) is the primary UX-facing check; this is the real backstop so this use
// case is never reachable with an oversized message from any caller — a generous static Zod
// ceiling at the backend DTO layer alone left the tenant's real, often-smaller resolved cap
// unenforced for any caller reaching this endpoint directly (PR #360 review).
export function enforceMessageLength(
  deps: ChatbotCapCheckDeps,
  input: SendChatMessageUseCaseInput,
): void {
  const maxMessageLength =
    input.chatbotSettings.maxMessageLengthChars ?? DEFAULT_MAX_MESSAGE_LENGTH_CHARS;
  if (input.userMessage.length > maxMessageLength) {
    rejectAndThrow(
      deps,
      'message_too_long',
      input.sessionId,
      () => new ChatbotMessageTooLongError(),
    );
  }
}

export async function resolveExistingSession(
  deps: ChatbotCapCheckDeps,
  sessionId: string,
  tenantId: string,
  chatbotSettings: ChatbotSettings,
): Promise<ResolvedSession> {
  const existing = await deps.sessionRepo.findById(sessionId, tenantId);
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
    await deps.txManager.run(() => deps.sessionRepo.save(session));
    rejectAndThrow(deps, 'message_cap', session.id, () => new ChatbotMessageCapReachedError());
  }

  const maxHistory =
    chatbotSettings.maxHistoryMessagesSentToLlm ?? DEFAULT_MAX_HISTORY_MESSAGES_SENT_TO_LLM;
  const recentMessages = await deps.messageRepo.findRecentBySession(
    sessionId,
    tenantId,
    maxHistory,
  );

  return { session, history: recentMessages.map(toChatTurn) };
}

export async function resolveNewSession(
  deps: ChatbotCapCheckDeps,
  input: SendChatMessageUseCaseInput,
  resolvedProviderName: string,
): Promise<ResolvedSession> {
  const { tenantId, clientIp, chatbotSettings } = input;
  const now = new Date();
  const conversationDate = utcDateToLocalDate(now, input.timezone);

  await checkNewSessionVolumeCaps(deps, input, now, conversationDate);

  // Layer 4 — a first turn always writes 2 rows (USER + ASSISTANT). If the tenant's configured
  // cap can't even fit one turn (0 or 1 — no min-bound validator exists on
  // maxMessagesPerConversation), reject before creating the session at all, mirroring
  // resolveExistingSession's own +2 > maxMessages check (PR #360 review).
  const maxMessages =
    chatbotSettings.maxMessagesPerConversation ?? DEFAULT_MAX_MESSAGES_PER_CONVERSATION;
  if (2 > maxMessages) {
    rejectAndThrow(deps, 'message_cap', undefined, () => new ChatbotMessageCapReachedError());
  }

  await enforcePlatformBackstops(deps, resolvedProviderName);

  const session = ChatbotSession.create({ tenantId, clientIp, conversationDate });
  return { session, history: [] };
}

// Layers 1-3 (daily / per-IP-daily / concurrency) — checked together before any session row
// exists, so a caller past all three still needs the layer-4 message-cap and platform-backstop
// checks below before a session is actually created.
async function checkNewSessionVolumeCaps(
  deps: ChatbotCapCheckDeps,
  input: SendChatMessageUseCaseInput,
  now: Date,
  conversationDate: string,
): Promise<void> {
  const { tenantId, clientIp, chatbotSettings } = input;

  const maxPerDay = chatbotSettings.maxConversationsPerDay ?? DEFAULT_MAX_CONVERSATIONS_PER_DAY;
  const dailyCount = await deps.sessionRepo.countByTenantAndDate(tenantId, conversationDate);
  if (dailyCount >= maxPerDay) {
    rejectAndThrow(deps, 'daily_cap', undefined, () => new ChatbotDailyCapReachedError());
  }

  const maxPerIpPerDay =
    chatbotSettings.maxConversationsPerIpPerDay ?? DEFAULT_MAX_CONVERSATIONS_PER_IP_PER_DAY;
  const ipDailyCount = await deps.sessionRepo.countByTenantIpAndDate(
    tenantId,
    clientIp,
    conversationDate,
  );
  if (ipDailyCount >= maxPerIpPerDay) {
    rejectAndThrow(deps, 'daily_cap', undefined, () => new ChatbotDailyCapReachedError());
  }

  const maxConcurrent =
    chatbotSettings.maxConcurrentConversations ?? DEFAULT_MAX_CONCURRENT_CONVERSATIONS;
  const concurrentCount = await deps.sessionRepo.countActiveSince(
    tenantId,
    new Date(now.getTime() - CONCURRENCY_WINDOW_MS),
  );
  if (concurrentCount >= maxConcurrent) {
    rejectAndThrow(
      deps,
      'concurrency_cap',
      undefined,
      () => new ChatbotConcurrencyCapReachedError(),
    );
  }
}

// Platform-wide backstops (layers 9-10) — new-session creation only, per
// docs/discovery/CHATBOT/CHATBOT.md §8.9: "already-open conversations remain bounded by their
// own per-session caps regardless" (not the global breaker). Checking these on every message of
// an already-open conversation contradicted this canonical text (PR #360 review — reverting the
// M19-S05 story-discovery decision to check on every message).
export async function enforcePlatformBackstops(
  deps: ChatbotCapCheckDeps,
  resolvedProviderName: string,
): Promise<void> {
  const globalSpendLimitUsd = new Decimal(
    deps.config.getOrThrow('CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD'),
  );
  const todaySpend = await deps.messageRepo.sumCostUsdSince(new Date(startOfDayUTC(todayUTC())));
  if (todaySpend.greaterThanOrEqualTo(globalSpendLimitUsd)) {
    rejectAndThrow(
      deps,
      'global_spend_limit',
      undefined,
      () => new ChatbotGlobalSpendLimitReachedError(),
    );
  }

  const balance = await deps.balanceRepo.findByProvider(resolvedProviderName);
  const minBalanceUsd = new Decimal(deps.config.getOrThrow('CHATBOT_MIN_PROVIDER_BALANCE_USD'));
  // remainingUsd is null until S08's first poll for this provider, and always null for a
  // provider with no prepaid-balance concept (Anthropic/OpenAI) — treated as "not tripped",
  // never as a comparison failure.
  if (balance?.remainingUsd?.lessThan(minBalanceUsd)) {
    rejectAndThrow(
      deps,
      'provider_balance_low',
      undefined,
      () => new ChatbotProviderBalanceLowError(),
    );
  }
}

// The real cause is logged server-side only — never embedded in the public Problem Details
// response, which could otherwise leak upstream vendor diagnostic details (PR #360 review).
export function handleProviderFailure(
  deps: ChatbotCapCheckDeps,
  err: unknown,
  session: ChatbotSession,
  resolvedProviderName: string,
): never {
  deps.logger.error(
    'Chatbot LLM provider call failed',
    err instanceof Error ? err.stack : undefined,
    { sessionId: session.id, provider: resolvedProviderName },
  );
  deps.tracingPort.setActiveSpanAttributes({
    'chatbot.session_id': session.id,
    'chatbot.provider': resolvedProviderName,
    'chatbot.cap_rejected': 'provider_unavailable',
  });
  throw new ChatbotProviderUnavailableError();
}

/** Structured log (AppThrottlerGuard's own logging pattern) + span attribute + throw, in one
 * place so every cap-rejection site does all three identically. */
export function rejectAndThrow(
  deps: ChatbotCapCheckDeps,
  capLayer: string,
  sessionId: string | undefined,
  buildError: () => Error,
): never {
  deps.logger.warn('Chatbot cap rejected request', { capLayer, sessionId });
  deps.tracingPort.setActiveSpanAttributes({
    'chatbot.cap_rejected': capLayer,
    ...(sessionId ? { 'chatbot.session_id': sessionId } : {}),
  });
  throw buildError();
}

function toChatTurn(message: ChatbotMessage): ChatTurn {
  return { role: message.role === 'USER' ? 'user' : 'assistant', content: message.content };
}
