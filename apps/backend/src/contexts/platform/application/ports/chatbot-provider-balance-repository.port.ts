import { ChatbotProviderBalance } from '../../domain/chatbot-provider-balance.aggregate';

export const CHATBOT_PROVIDER_BALANCE_REPOSITORY = Symbol('IChatbotProviderBalanceRepository');

// Two independent, narrowly-scoped write methods instead of one generic save() — the table has
// two independent writers (S08's balance poll, S05/S06's health signal) sharing one row by
// provider, and each write must touch only its own columns via a partial upsert. A single
// generic save(entity) mapping every aggregate field onto the entity would silently clobber
// whichever columns the other writer owns. See docs/13-DATABASE_SCHEMA.md's "Write discipline"
// note for the full rationale.
export interface IChatbotProviderBalanceRepository {
  findByProvider(provider: string): Promise<ChatbotProviderBalance | null>;
  /** S08's balance-poll write — touches remaining_usd/checked_at only. */
  saveBalance(balance: ChatbotProviderBalance): Promise<void>;
  /** S05/S06's health-signal write — touches last_success_at OR last_failure_at only. Must
   * never be called from a cap/volume-rejection path — only a genuine ILlmProvider.complete()
   * outcome. */
  recordCallOutcome(
    provider: string,
    outcome: 'SUCCESS' | 'FAILURE',
    occurredAt: Date,
  ): Promise<void>;
}
