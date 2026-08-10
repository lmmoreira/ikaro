import { ChatbotProviderBalanceEntity } from '../../../contexts/platform/infrastructure/entities/chatbot-provider-balance.entity';

export class ChatbotProviderBalanceEntityBuilder {
  private provider = 'openrouter';
  private remainingUsd = '18.4200';
  private readonly checkedAt = new Date('2026-01-01T00:00:00Z');

  withProvider(provider: string): this {
    this.provider = provider;
    return this;
  }

  withRemainingUsd(remainingUsd: string): this {
    this.remainingUsd = remainingUsd;
    return this;
  }

  build(): ChatbotProviderBalanceEntity {
    const e = new ChatbotProviderBalanceEntity();
    e.provider = this.provider;
    e.remainingUsd = this.remainingUsd;
    e.checkedAt = this.checkedAt;
    return e;
  }
}
