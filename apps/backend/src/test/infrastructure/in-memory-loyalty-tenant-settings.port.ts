import {
  ILoyaltyTenantSettingsPort,
  LoyaltyTenantSettings,
} from '../../contexts/loyalty/application/ports/loyalty-tenant-settings.port';

export class InMemoryLoyaltyTenantSettingsPort implements ILoyaltyTenantSettingsPort {
  private settings: LoyaltyTenantSettings = { expiryDays: 180 };

  withExpiryDays(days: number): this {
    this.settings = { expiryDays: days };
    return this;
  }

  async getLoyaltySettings(_tenantId: string): Promise<LoyaltyTenantSettings> {
    return { ...this.settings };
  }
}
