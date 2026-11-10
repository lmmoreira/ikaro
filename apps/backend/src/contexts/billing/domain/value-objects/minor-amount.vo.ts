import { ValueObject } from '../../../../shared/domain/value-object';
import { MinorAmountValidationError } from '../errors/billing-domain.error';

interface MinorAmountProps {
  amountMinor: number;
  currency: string;
}

// The runtime's own ISO 4217 list (ICU), not just the three-letter shape: "ZZZ" is well-formed but
// not a currency.
const ISO_4217_CODES: ReadonlySet<string> = new Set(Intl.supportedValuesOf('currency'));

/**
 * A Billing amount: a non-negative integer in minor units (centavos / cents) plus an ISO 4217
 * currency code. Sits beside the Decimal-based shared `Money` (which stays untouched): Billing
 * stores `amount_minor` as a bigint and must never see a float (M25-D4).
 */
export class MinorAmount extends ValueObject<MinorAmountProps> {
  private constructor(props: MinorAmountProps) {
    super(props);
  }

  static create(amountMinor: number, currency: string): MinorAmount {
    if (!Number.isSafeInteger(amountMinor)) {
      throw new MinorAmountValidationError(
        `amountMinor must be an integer number of minor units: ${amountMinor}`,
      );
    }
    if (amountMinor < 0) {
      throw new MinorAmountValidationError(`amountMinor must not be negative: ${amountMinor}`);
    }
    if (!ISO_4217_CODES.has(currency)) {
      throw new MinorAmountValidationError(
        `currency must be an uppercase ISO 4217 code: ${currency}`,
      );
    }
    return new MinorAmount({ amountMinor, currency });
  }

  static reconstitute(amountMinor: number, currency: string): MinorAmount {
    return new MinorAmount({ amountMinor, currency });
  }

  get amountMinor(): number {
    return this.props.amountMinor;
  }

  get currency(): string {
    return this.props.currency;
  }
}
