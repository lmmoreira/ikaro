export const LOYALTY_PLATFORM_PORT = Symbol('ILoyaltyPlatformPort');

export interface LoyaltyTenantSettings {
  expiryDays: number;
  notificationMinPoints: number;
  pointsPerCurrencyUnit: number;
}

export interface ILoyaltyPlatformPort {
  getLoyaltySettings(tenantId: string): Promise<LoyaltyTenantSettings>;
}
