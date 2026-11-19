import type { BillingAccount, BillingProvider } from '../../domain/billing-account.aggregate';

export const BILLING_ACCOUNT_REPOSITORY = Symbol('IBillingAccountRepository');

/** One billing account per tenant (`UNIQUE(tenant_id)`). */
export interface IBillingAccountRepository {
  /**
   * The tenant's account, with `countryCode` taken from the tenant's subscription row (an account
   * with no subscription is `BillingAccountSubscriptionMissingError`).
   */
  findByTenantId(tenantId: string): Promise<BillingAccount | null>;

  /**
   * Cross-tenant job lookup (no tenant: the webhook resolves the tenant from the provider customer
   * id before any tenant context exists), served by the UNIQUE standalone index
   * `UQ_billing_billing_accounts_provider_customer`.
   */
  findByProviderCustomerIdForJob(
    provider: BillingProvider,
    providerCustomerId: string,
  ): Promise<BillingAccount | null>;

  /** Inserts or updates the account; never writes the country (it lives on the subscription). */
  save(account: BillingAccount): Promise<void>;
}
