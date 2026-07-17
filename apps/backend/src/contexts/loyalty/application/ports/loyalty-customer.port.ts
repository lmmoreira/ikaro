export const LOYALTY_CUSTOMER_PORT = Symbol('ILoyaltyCustomerPort');

export interface ILoyaltyCustomerPort {
  // Given a customer's ID in their home tenant, resolves their customer ID in a different
  // tenant (same Google OAuth user, different tenant row). Throws
  // LoyaltyCustomerNotFoundInTenantError if the user has no record in the target tenant.
  resolveCustomerIdByOAuthId(
    homeCustomerId: string,
    homeTenantId: string,
    targetTenantId: string,
  ): Promise<string>;
}
