import { Decimal } from 'decimal.js';
import { ValueObject } from '../domain/value-object';
import { formatMoney } from '../utils/money-format';

interface MoneyProps {
  amount: string; // stored as string to preserve precision across serialization
  currency: string; // ISO 4217
}

export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  static from(amount: number | string | Decimal, currency: string): Money {
    const decimal = new Decimal(amount);
    if (decimal.isNaN() || !decimal.isFinite()) {
      throw new Error(`Invalid money amount: ${String(amount)}`);
    }
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      throw new Error(`Invalid money currency: ${currency}`);
    }
    return new Money({ amount: decimal.toFixed(2), currency: normalizedCurrency });
  }

  static zero(currency: string): Money {
    return Money.from(0, currency);
  }

  get amount(): Decimal {
    return new Decimal(this.props.amount);
  }

  get currency(): string {
    return this.props.currency;
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error(`Cannot add ${this.currency} and ${other.currency}`);
    }
    return Money.from(this.amount.plus(other.amount), this.currency);
  }

  format(locale: string): string {
    return formatMoney(this.amount.toFixed(2), locale, this.currency);
  }

  isGreaterThan(other: Money): boolean {
    return this.amount.greaterThan(other.amount);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }
}
