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
  private readonly failureByTenant = new Map<string, Error>();

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

  /** Makes the settings read for one tenant throw, like a transient Platform failure. */
  withFailureForTenant(tenantId: string, error: Error = new Error('settings read failed')): this {
    this.failureByTenant.set(tenantId, error);
    return this;
  }

  /** Lets the settings read for one tenant succeed again, like Platform recovering before a redelivery. */
  clearFailureForTenant(tenantId: string): this {
    this.failureByTenant.delete(tenantId);
    return this;
  }

  async getLoyaltySettings(tenantId: string): Promise<LoyaltyTenantSettings> {
    const failure = this.failureByTenant.get(tenantId);
    if (failure) throw failure;
    const tenantRate = this.pointsPerCurrencyUnitByTenant.get(tenantId);
    return {
      ...this.settings,
      ...(tenantRate !== undefined ? { pointsPerCurrencyUnit: tenantRate } : {}),
    };
  }
}
