import { Decimal } from 'decimal.js';
import { ChatbotProviderBalance } from '../../../contexts/platform/domain/chatbot-provider-balance.aggregate';

const DEFAULT_PROVIDER = 'openrouter';
const DEFAULT_REMAINING_USD = 25.5;

export class ChatbotProviderBalanceBuilder {
  private provider = DEFAULT_PROVIDER;
  private remainingUsd: number | null = DEFAULT_REMAINING_USD;
  private lastSuccessAt: Date | null = null;
  private lastFailureAt: Date | null = null;

  withProvider(provider: string): this {
    this.provider = provider;
    return this;
  }

  withRemainingUsd(remainingUsd: number | null): this {
    this.remainingUsd = remainingUsd;
    return this;
  }

  withLastSuccessAt(lastSuccessAt: Date | null): this {
    this.lastSuccessAt = lastSuccessAt;
    return this;
  }

  withLastFailureAt(lastFailureAt: Date | null): this {
    this.lastFailureAt = lastFailureAt;
    return this;
  }

  build(): ChatbotProviderBalance {
    const balance = ChatbotProviderBalance.reconstitute({
      provider: this.provider,
      remainingUsd: this.remainingUsd === null ? null : new Decimal(this.remainingUsd),
      checkedAt: this.remainingUsd === null ? null : new Date(),
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
    });
    balance.clearDomainEvents();
    return balance;
  }
}
