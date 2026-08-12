import { Decimal } from 'decimal.js';
import { AggregateRoot } from '../../../shared/domain/aggregate-root';

export interface ChatbotProviderBalanceProps {
  provider: string;
  // null until S08's first successful poll for this provider; always null for a provider with
  // no prepaid-balance concept (Anthropic/OpenAI) — see docs/13-DATABASE_SCHEMA.md.
  remainingUsd: Decimal | null;
  checkedAt: Date | null;
  // Written by SendChatMessageUseCase (S05/S06) on every real ILlmProvider.complete() outcome —
  // never by a cap/volume rejection. See isHealthy()'s own docstring for the availability rule.
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
}

export class ChatbotProviderBalance extends AggregateRoot {
  readonly provider: string;
  readonly remainingUsd: Decimal | null;
  readonly checkedAt: Date | null;
  readonly lastSuccessAt: Date | null;
  readonly lastFailureAt: Date | null;

  private constructor(props: ChatbotProviderBalanceProps) {
    super();
    this.provider = props.provider;
    this.remainingUsd = props.remainingUsd;
    this.checkedAt = props.checkedAt;
    this.lastSuccessAt = props.lastSuccessAt;
    this.lastFailureAt = props.lastFailureAt;
  }

  static upsert(provider: string, remainingUsd: Decimal | number | string): ChatbotProviderBalance {
    return new ChatbotProviderBalance({
      provider,
      remainingUsd: new Decimal(remainingUsd),
      checkedAt: new Date(),
      lastSuccessAt: null,
      lastFailureAt: null,
    });
  }

  static reconstitute(props: ChatbotProviderBalanceProps): ChatbotProviderBalance {
    return new ChatbotProviderBalance(props);
  }

  /**
   * UC-034 condition (c) — a half-open/circuit-breaker cooldown, not a plain "most recent event
   * wins" comparison. Unhealthy only if lastFailureAt is more recent than lastSuccessAt AND that
   * failure happened within the last `cooldownMinutes`. Without the cooldown, a single transient
   * failure would take the widget dark forever: `available: false` means the widget never
   * renders at all, so no visitor could ever attempt the message that would produce the success
   * needed to clear it. Once the cooldown elapses, this returns true again — optimistically,
   * without proof — giving the next real visitor's attempt the chance to confirm recovery (a
   * fresh lastSuccessAt) or restart the wait (a fresh lastFailureAt). Full rationale:
   * docs/13-DATABASE_SCHEMA.md's chatbot_provider_balance section.
   */
  isHealthy(cooldownMinutes: number, now: Date = new Date()): boolean {
    const failureIsMostRecent =
      this.lastFailureAt !== null &&
      (this.lastSuccessAt === null || this.lastFailureAt > this.lastSuccessAt);
    if (!failureIsMostRecent) return true;

    const cooldownMs = cooldownMinutes * 60 * 1000;
    return now.getTime() - this.lastFailureAt!.getTime() >= cooldownMs;
  }
}
