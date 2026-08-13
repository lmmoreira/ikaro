import { IChatbotProviderBalanceRepository } from '../../../contexts/platform/application/ports/chatbot-provider-balance-repository.port';
import { ChatbotProviderBalance } from '../../../contexts/platform/domain/chatbot-provider-balance.aggregate';

// Mirrors the real TypeOrmChatbotProviderBalanceRepository's partial-write discipline: each
// method touches only its own columns, merging onto whatever the other writer already stored —
// not a plain Map.set() overwrite — so tests exercising both writers see the same
// non-clobbering behavior the real partial upsert guarantees.
export class InMemoryChatbotProviderBalanceRepository implements IChatbotProviderBalanceRepository {
  private readonly store = new Map<string, ChatbotProviderBalance>();

  async findByProvider(provider: string): Promise<ChatbotProviderBalance | null> {
    return this.store.get(provider) ?? null;
  }

  async saveBalance(balance: ChatbotProviderBalance): Promise<void> {
    const existing = this.store.get(balance.provider);
    this.store.set(
      balance.provider,
      ChatbotProviderBalance.reconstitute({
        provider: balance.provider,
        remainingUsd: balance.remainingUsd,
        checkedAt: balance.checkedAt,
        lastSuccessAt: existing?.lastSuccessAt ?? null,
        lastFailureAt: existing?.lastFailureAt ?? null,
      }),
    );
  }

  async recordCallOutcome(
    provider: string,
    outcome: 'SUCCESS' | 'FAILURE',
    occurredAt: Date,
  ): Promise<void> {
    const existing = this.store.get(provider);
    this.store.set(
      provider,
      ChatbotProviderBalance.reconstitute({
        provider,
        remainingUsd: existing?.remainingUsd ?? null,
        checkedAt: existing?.checkedAt ?? null,
        lastSuccessAt: outcome === 'SUCCESS' ? occurredAt : (existing?.lastSuccessAt ?? null),
        lastFailureAt: outcome === 'FAILURE' ? occurredAt : (existing?.lastFailureAt ?? null),
      }),
    );
  }
}
