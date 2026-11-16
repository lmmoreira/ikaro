import { Injectable } from '@nestjs/common';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import {
  ILoyaltyPlatformPort,
  LoyaltyTenantSettings,
} from '../../application/ports/loyalty-platform.port';

// Fails closed: every failure of the tenant read, a missing tenant included, propagates to the caller
// (the BookingCompleted handler nacks and Pub/Sub retries; the warning job isolates that tenant). It
// never substitutes default settings, which would store a wrong expiry or a zero conversion rate.
@Injectable()
export class LoyaltyPlatformAdapter implements ILoyaltyPlatformPort {
  constructor(private readonly getTenantById: GetTenantByIdUseCase) {}

  async getLoyaltySettings(tenantId: string): Promise<LoyaltyTenantSettings> {
    const result = await this.getTenantById.execute({ tenantId });
    return {
      expiryDays: result.settings.loyalty.expiryDays,
      notificationMinPoints: result.settings.loyalty.notificationMinPoints,
      pointsPerCurrencyUnit: result.settings.loyalty.pointsPerCurrencyUnit,
    };
  }
}
