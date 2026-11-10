// Billing domain errors (M25-S04). Plain typed classes: the Billing HTTP error mapper and the
// BillingErrorCode catalog arrive with M25-S06 (which maps these), so nothing here reaches HTTP yet.
export class BillingDomainError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype); // required — instanceof fails without this
    this.name = 'BillingDomainError';
  }
}

/** No price row, or no version in force at the asked date — never answered with a zero price. */
export class FeaturePriceNotFoundError extends BillingDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'FeaturePriceNotFoundError';
  }
}

/** A FeaturePrice invariant was broken (tier/feature, cycle, currency/country, version order). */
export class FeaturePriceInvariantError extends BillingDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'FeaturePriceInvariantError';
  }
}

/** A MinorAmount was built from a fractional, negative or unsafe amount or a non-ISO currency. */
export class MinorAmountValidationError extends BillingDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'MinorAmountValidationError';
  }
}
