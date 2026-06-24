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
  private readonly pointsPerCurrencyUnitByTenant = new Map<string, number>();

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

  withPointsPerCurrencyUnitForTenant(tenantId: string, rate: number): this {
    this.pointsPerCurrencyUnitByTenant.set(tenantId, rate);
    return this;
  }

  async getLoyaltySettings(tenantId: string): Promise<LoyaltyTenantSettings> {
    const tenantRate = this.pointsPerCurrencyUnitByTenant.get(tenantId);
    return {
      ...this.settings,
      ...(tenantRate !== undefined ? { pointsPerCurrencyUnit: tenantRate } : {}),
    };
  }
}
