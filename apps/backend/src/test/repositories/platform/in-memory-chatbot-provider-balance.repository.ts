import { IChatbotProviderBalanceRepository } from '../../../contexts/platform/application/ports/chatbot-provider-balance-repository.port';
import { ChatbotProviderBalance } from '../../../contexts/platform/domain/chatbot-provider-balance.aggregate';

export class InMemoryChatbotProviderBalanceRepository implements IChatbotProviderBalanceRepository {
  private readonly store = new Map<string, ChatbotProviderBalance>();

  async findByProvider(provider: string): Promise<ChatbotProviderBalance | null> {
    return this.store.get(provider) ?? null;
  }

  async save(balance: ChatbotProviderBalance): Promise<void> {
    this.store.set(balance.provider, balance);
  }
}
