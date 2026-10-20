import type { Decimal } from 'decimal.js';
import { IOpenRouterCreditsPort } from '../../contexts/platform/application/ports/openrouter-credits.port';

export class InMemoryOpenRouterCreditsPort implements IOpenRouterCreditsPort {
  calls = 0;
  private balance: Decimal | null = null;
  private failure: Error | null = null;

  returns(balance: Decimal): this {
    this.balance = balance;
    this.failure = null;
    return this;
  }

  fails(error: Error): this {
    this.failure = error;
    this.balance = null;
    return this;
  }

  getRemainingBalanceUsd(): Promise<Decimal> {
    this.calls += 1;
    if (this.failure) return Promise.reject(this.failure);
    if (!this.balance)
      return Promise.reject(new Error('InMemoryOpenRouterCreditsPort: no result set'));
    return Promise.resolve(this.balance);
  }
}
