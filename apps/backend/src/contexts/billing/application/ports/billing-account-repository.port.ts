import type { BillingAccount } from '../../domain/billing-account.aggregate';

export const BILLING_ACCOUNT_REPOSITORY = Symbol('IBillingAccountRepository');

/** One billing account per tenant (`UNIQUE(tenant_id)`). */
export interface IBillingAccountRepository {
  /**
   * The tenant's account, with `countryCode` taken from the tenant's subscription row (an account
   * with no subscription is `BillingAccountSubscriptionMissingError`).
   */
  findByTenantId(tenantId: string): Promise<BillingAccount | null>;

  /** Inserts or updates the account; never writes the country (it lives on the subscription). */
  save(account: BillingAccount): Promise<void>;
}
