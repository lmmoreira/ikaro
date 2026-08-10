import { ChatbotProviderBalance } from '../../../contexts/platform/domain/chatbot-provider-balance.aggregate';

const DEFAULT_PROVIDER = 'openrouter';
const DEFAULT_REMAINING_USD = 25.5;

export class ChatbotProviderBalanceBuilder {
  private provider = DEFAULT_PROVIDER;
  private remainingUsd = DEFAULT_REMAINING_USD;

  withProvider(provider: string): this {
    this.provider = provider;
    return this;
  }

  withRemainingUsd(remainingUsd: number): this {
    this.remainingUsd = remainingUsd;
    return this;
  }

  build(): ChatbotProviderBalance {
    const balance = ChatbotProviderBalance.upsert(this.provider, this.remainingUsd);
    balance.clearDomainEvents();
    return balance;
  }
}
