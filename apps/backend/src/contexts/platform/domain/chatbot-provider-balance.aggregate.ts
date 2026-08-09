import { AggregateRoot } from '../../../shared/domain/aggregate-root';

export interface ChatbotProviderBalanceProps {
  provider: string;
  remainingUsd: number;
  checkedAt: Date;
}

export class ChatbotProviderBalance extends AggregateRoot {
  readonly provider: string;
  readonly remainingUsd: number;
  readonly checkedAt: Date;

  private constructor(props: ChatbotProviderBalanceProps) {
    super();
    this.provider = props.provider;
    this.remainingUsd = props.remainingUsd;
    this.checkedAt = props.checkedAt;
  }

  static upsert(provider: string, remainingUsd: number): ChatbotProviderBalance {
    return new ChatbotProviderBalance({
      provider,
      remainingUsd,
      checkedAt: new Date(),
    });
  }

  static reconstitute(props: ChatbotProviderBalanceProps): ChatbotProviderBalance {
    return new ChatbotProviderBalance(props);
  }
}
