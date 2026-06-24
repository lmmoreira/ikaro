import {
  ILoyaltyPlatformPort,
  LoyaltyTenantSettings,
} from '../../contexts/loyalty/application/ports/loyalty-platform.port';

export class InMemoryLoyaltyPlatformPort implements ILoyaltyPlatformPort {
  private settings: LoyaltyTenantSettings = {
    expiryDays: 180,
    notificationMinPoints: 0,
    pointsPerCurrencyUnit: 0,
  };

  withExpiryDays(days: number): this {
    this.settings = { ...this.settings, expiryDays: days };
    return this;
  }

  withNotificationMinPoints(min: number): this {
    this.settings = { ...this.settings, notificationMinPoints: min };
    return this;
  }

  withPointsPerCurrencyUnit(rate: number): this {
    this.settings = { ...this.settings, pointsPerCurrencyUnit: rate };
    return this;
  }

  async getLoyaltySettings(_tenantId: string): Promise<LoyaltyTenantSettings> {
    return { ...this.settings };
  }
}
