import { BillingDomainError } from './billing-domain.error';

/** The provider refused to cancel because the charge was just paid; the payment wins. */
export class ChargeAlreadyPaidError extends BillingDomainError {
  constructor(readonly providerChargeId: string) {
    super(`Charge ${providerChargeId} is already paid and cannot be cancelled`);
    this.name = 'ChargeAlreadyPaidError';
  }
}

/** No adapter serves this merchant profile key yet (a sandbox, live or non-BRL key), or the adapter lacks the operation. */
export class ProviderNotSupportedError extends BillingDomainError {
  constructor(readonly subject: string) {
    super(`No billing provider supports ${subject}`);
    this.name = 'ProviderNotSupportedError';
  }
}

/** The inbound webhook body cannot be read as a provider event (not JSON, or a required field is missing). */
export class InvalidProviderWebhookError extends BillingDomainError {
  constructor(reason: string) {
    super(`Invalid provider webhook: ${reason}`);
    this.name = 'InvalidProviderWebhookError';
  }
}

/** A merchant profile key used in an environment it must never run in (fake in production, live elsewhere). */
export class MerchantProfileKeyNotAllowedError extends BillingDomainError {
  constructor(
    readonly merchantProfileKey: string,
    readonly appEnv: string,
  ) {
    super(`Merchant profile key ${merchantProfileKey} is not allowed when APP_ENV=${appEnv}`);
    this.name = 'MerchantProfileKeyNotAllowedError';
  }
}

export type ProviderRequestFailure =
  'UNAVAILABLE' | 'LINK_EXPIRED' | 'INVALID_LOCATION' | 'INVALID_AMOUNT' | 'NOT_FOUND';

/** A call to the provider failed: it was unreachable (5xx), the link expired, the location or amount is invalid, or the id is unknown. */
export class ProviderRequestError extends BillingDomainError {
  constructor(readonly reason: ProviderRequestFailure) {
    super(`The billing provider request failed: ${reason}`);
    this.name = 'ProviderRequestError';
  }
}
