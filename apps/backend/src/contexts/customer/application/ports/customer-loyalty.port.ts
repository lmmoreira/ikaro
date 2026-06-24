export const CUSTOMER_LOYALTY_PORT = Symbol('ICustomerLoyaltyPort');

export interface ICustomerLoyaltyPort {
  getCurrentPoints(tenantId: string, customerId: string): Promise<number>;
}
