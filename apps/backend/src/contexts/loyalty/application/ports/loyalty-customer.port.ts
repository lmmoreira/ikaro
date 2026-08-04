export const LOYALTY_CUSTOMER_PORT = Symbol('ILoyaltyCustomerPort');

export interface LoyaltyCustomerTenantPair {
  tenantId: string;
  customerId: string;
}

export interface ILoyaltyCustomerPort {
  // Given a customer's ID in their home tenant, resolves their customer ID in a different
  // tenant (same Google OAuth user, different tenant row). Throws
  // LoyaltyCustomerNotFoundInTenantError if the user has no record in the target tenant.
  resolveCustomerIdByOAuthId(
    homeCustomerId: string,
    homeTenantId: string,
    targetTenantId: string,
  ): Promise<string>;

  // Resolves every tenant/customerId pair for the same Google OAuth user as the home
  // customer — the full set resolveCustomerIdByOAuthId narrows down to one target tenant.
  // Throws LoyaltyCustomerNotFoundInTenantError if the home customer does not exist.
  resolveAllTenantsByOAuthId(
    homeCustomerId: string,
    homeTenantId: string,
  ): Promise<LoyaltyCustomerTenantPair[]>;
}
