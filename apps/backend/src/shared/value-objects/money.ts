import { Decimal } from 'decimal.js';
import { MoneyErrorCode } from '@ikaro/types';
import { DomainErrorShape } from '../domain/domain-error-shape';
import { ValueObject } from '../domain/value-object';
import { formatMoney } from '../utils/money-format';

interface MoneyProps {
  amount: string; // stored as string to preserve precision across serialization
  currency: string; // ISO 4217
}

export class MoneyValidationError extends Error implements DomainErrorShape {
  readonly code: MoneyErrorCode;

  constructor(message: string, code: MoneyErrorCode) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'MoneyValidationError';
    this.code = code;
  }
}

export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  static from(amount: number | string | Decimal, currency: string): Money {
    const decimal = new Decimal(amount);
    if (decimal.isNaN() || !decimal.isFinite()) {
      throw new MoneyValidationError(
        `Invalid money amount: ${String(amount)}`,
        MoneyErrorCode.AMOUNT_INVALID,
      );
    }
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      throw new MoneyValidationError(
        `Invalid money currency: ${currency}`,
        MoneyErrorCode.CURRENCY_INVALID,
      );
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
      throw new MoneyValidationError(
        `Cannot add ${this.currency} and ${other.currency}`,
        MoneyErrorCode.CURRENCY_MISMATCH,
      );
    }
    return Money.from(this.amount.plus(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new MoneyValidationError(
        `Cannot subtract ${other.currency} from ${this.currency}`,
        MoneyErrorCode.CURRENCY_MISMATCH,
      );
    }
    return Money.from(this.amount.minus(other.amount), this.currency);
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
