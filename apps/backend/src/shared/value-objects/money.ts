import { Decimal } from 'decimal.js';
import { ValueObject } from '../domain/value-object';

interface MoneyProps {
  amount: string; // stored as string to preserve precision across serialization
  currency: 'BRL';
}

export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  static from(amount: number | string | Decimal, currency: 'BRL' = 'BRL'): Money {
    const decimal = new Decimal(amount);
    if (decimal.isNaN() || !decimal.isFinite()) {
      throw new Error(`Invalid money amount: ${String(amount)}`);
    }
    return new Money({ amount: decimal.toFixed(2), currency });
  }

  static zero(): Money {
    return Money.from(0);
  }

  get amount(): Decimal {
    return new Decimal(this.props.amount);
  }

  get currency(): 'BRL' {
    return this.props.currency;
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error(`Cannot add ${this.currency} and ${other.currency}`);
    }
    return Money.from(this.amount.plus(other.amount), this.currency);
  }

  format(): string {
    const [intPart, decPart] = this.props.amount.split('.');
    const intFormatted = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `R$ ${intFormatted},${decPart ?? '00'}`;
  }

  isGreaterThan(other: Money): boolean {
    return this.amount.greaterThan(other.amount);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }
}
