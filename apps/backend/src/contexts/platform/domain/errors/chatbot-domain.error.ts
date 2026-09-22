import { PlatformErrorCode } from '@ikaro/types/protocol/errors';
import { PlatformDomainError } from './platform-domain.error';

/**
 * Chatbot cap-rejection errors (UC-033, docs/discovery/CHATBOT/CHATBOT.md §8) — all mapped to
 * HTTP 429 in platform-error.mapper.ts. Covers both layer 1 (tenant-wide) and layer 2 (per-IP)
 * daily caps: same visitor-facing outcome ("come back tomorrow"), same error code.
 */
export class ChatbotDailyCapReachedError extends PlatformDomainError {
  constructor() {
    super(
      "Tenant's daily chatbot conversation cap has been reached",
      PlatformErrorCode.CHATBOT_DAILY_CAP_REACHED,
    );
    this.name = 'ChatbotDailyCapReachedError';
  }
}

export class ChatbotConcurrencyCapReachedError extends PlatformDomainError {
  constructor() {
    super(
      "Tenant's concurrent chatbot conversation cap has been reached",
      PlatformErrorCode.CHATBOT_CONCURRENCY_CAP_REACHED,
    );
    this.name = 'ChatbotConcurrencyCapReachedError';
  }
}

export class ChatbotMessageCapReachedError extends PlatformDomainError {
  constructor() {
    super(
      'This conversation has reached its message cap',
      PlatformErrorCode.CHATBOT_MESSAGE_CAP_REACHED,
    );
    this.name = 'ChatbotMessageCapReachedError';
  }
}

/** Platform-wide backstop (layer 9) — never tenant-scoped, refuses new sessions for everyone. */
export class ChatbotGlobalSpendLimitReachedError extends PlatformDomainError {
  constructor() {
    super(
      'Platform-wide chatbot daily spend limit has been reached',
      PlatformErrorCode.CHATBOT_GLOBAL_SPEND_LIMIT_REACHED,
    );
    this.name = 'ChatbotGlobalSpendLimitReachedError';
  }
}

/** Platform-wide backstop (layer 10) — the resolved provider's prepaid balance is too low. */
export class ChatbotProviderBalanceLowError extends PlatformDomainError {
  constructor() {
    super(
      "The resolved LLM provider's balance is below the minimum threshold",
      PlatformErrorCode.CHATBOT_PROVIDER_BALANCE_LOW,
    );
    this.name = 'ChatbotProviderBalanceLowError';
  }
}

/**
 * UC-033 A4 — the LLM provider call itself failed (timeout, upstream error, malformed response).
 * Mapped to 503, distinct from the 429 cap-rejection family above. Deliberately carries a fixed,
 * generic public message — never the real upstream error text, which can include vendor-specific
 * diagnostic details (PR #360 review finding). The real cause is logged server-side by the
 * use case before this is thrown, not embedded in the public Problem Details response.
 */
export class ChatbotProviderUnavailableError extends PlatformDomainError {
  constructor() {
    super(
      'The chat assistant is temporarily unavailable',
      PlatformErrorCode.CHATBOT_PROVIDER_UNAVAILABLE,
    );
    this.name = 'ChatbotProviderUnavailableError';
  }
}

/**
 * UC-033 A3 — resolved-cap message-length enforcement (layer 5), same
 * `tenant.settings.chatbot?.X ?? DEFAULT_X` resolution as every other cap. The BFF DTO layer
 * (S09) is the primary UX-facing check; this is the real backstop so the use case is never
 * reachable with an oversized message from any caller (PR #360 review finding — a generous
 * static Zod ceiling at the backend DTO layer alone left the tenant's real, often-smaller cap
 * unenforced for any caller that reaches this endpoint directly).
 */
export class ChatbotMessageTooLongError extends PlatformDomainError {
  constructor() {
    super('Message exceeds the maximum allowed length', PlatformErrorCode.CHATBOT_MESSAGE_TOO_LONG);
    this.name = 'ChatbotMessageTooLongError';
  }
}

/** docs/14-API_CONTRACTS.md: "404 — ... sessionId doesn't belong to this tenant". */
export class ChatbotSessionNotFoundError extends PlatformDomainError {
  constructor(sessionId: string) {
    super(
      `Chatbot session '${sessionId}' not found for this tenant`,
      PlatformErrorCode.CHATBOT_SESSION_NOT_FOUND,
    );
    this.name = 'ChatbotSessionNotFoundError';
  }
}
