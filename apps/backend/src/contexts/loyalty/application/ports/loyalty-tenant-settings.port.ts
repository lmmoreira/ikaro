export const LOYALTY_TENANT_SETTINGS_PORT = Symbol('ILoyaltyTenantSettingsPort');

export interface LoyaltyTenantSettings {
  expiryDays: number;
}

export interface ILoyaltyTenantSettingsPort {
  getLoyaltySettings(tenantId: string): Promise<LoyaltyTenantSettings>;
}
