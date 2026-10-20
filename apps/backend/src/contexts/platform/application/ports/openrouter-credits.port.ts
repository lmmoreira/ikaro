import type { Decimal } from 'decimal.js';

export const OPENROUTER_CREDITS_PORT = Symbol('OpenRouterCreditsPort');

export interface IOpenRouterCreditsPort {
  /**
   * Remaining OpenRouter balance in USD (total credits minus total usage). Throws on any
   * failure; the caller (ChatbotBalancePollJob) treats that as the documented "API failure"
   * case and leaves the stored balance unchanged.
   */
  getRemainingBalanceUsd(): Promise<Decimal>;
}
