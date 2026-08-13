import { ChatbotProviderBalanceEntity } from '../../../contexts/platform/infrastructure/entities/chatbot-provider-balance.entity';

export class ChatbotProviderBalanceEntityBuilder {
  private provider = 'openrouter';
  private remainingUsd: string | null = '18.4200';
  private checkedAt: Date | null = new Date('2026-01-01T00:00:00Z');
  private lastSuccessAt: Date | null = null;
  private lastFailureAt: Date | null = null;

  withProvider(provider: string): this {
    this.provider = provider;
    return this;
  }

  withRemainingUsd(remainingUsd: string | null): this {
    this.remainingUsd = remainingUsd;
    return this;
  }

  withCheckedAt(checkedAt: Date | null): this {
    this.checkedAt = checkedAt;
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

  build(): ChatbotProviderBalanceEntity {
    const e = new ChatbotProviderBalanceEntity();
    e.provider = this.provider;
    e.remainingUsd = this.remainingUsd;
    e.checkedAt = this.checkedAt;
    e.lastSuccessAt = this.lastSuccessAt;
    e.lastFailureAt = this.lastFailureAt;
    return e;
  }
}
