import { Decimal } from 'decimal.js';
import { AggregateRoot } from '../../../shared/domain/aggregate-root';

export interface ChatbotProviderBalanceProps {
  provider: string;
  remainingUsd: Decimal;
  checkedAt: Date;
}

export class ChatbotProviderBalance extends AggregateRoot {
  readonly provider: string;
  readonly remainingUsd: Decimal;
  readonly checkedAt: Date;

  private constructor(props: ChatbotProviderBalanceProps) {
    super();
    this.provider = props.provider;
    this.remainingUsd = props.remainingUsd;
    this.checkedAt = props.checkedAt;
  }

  static upsert(provider: string, remainingUsd: Decimal | number | string): ChatbotProviderBalance {
    return new ChatbotProviderBalance({
      provider,
      remainingUsd: new Decimal(remainingUsd),
      checkedAt: new Date(),
    });
  }

  static reconstitute(props: ChatbotProviderBalanceProps): ChatbotProviderBalance {
    return new ChatbotProviderBalance(props);
  }
}
