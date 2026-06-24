import { Injectable } from '@nestjs/common';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import {
  ILoyaltyPlatformPort,
  LoyaltyTenantSettings,
} from '../../application/ports/loyalty-platform.port';

const DEFAULTS: LoyaltyTenantSettings = { expiryDays: 180, notificationMinPoints: 50 };

@Injectable()
export class LoyaltyPlatformAdapter implements ILoyaltyPlatformPort {
  constructor(private readonly getTenantById: GetTenantByIdUseCase) {}

  async getLoyaltySettings(tenantId: string): Promise<LoyaltyTenantSettings> {
    try {
      const result = await this.getTenantById.execute(tenantId);
      return {
        expiryDays: result.settings.loyalty.expiryDays,
        notificationMinPoints: result.settings.loyalty.notificationMinPoints,
      };
    } catch {
      return { ...DEFAULTS };
    }
  }
}
