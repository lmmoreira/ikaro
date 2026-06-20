import { Injectable } from '@nestjs/common';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import {
  ITenantLocalizationPort,
  TenantLocalization,
} from '../../application/ports/tenant-localization.port';

@Injectable()
export class BookingTenantLocalizationAdapter implements ITenantLocalizationPort {
  constructor(private readonly getTenantById: GetTenantByIdUseCase) {}

  async getLocalization(tenantId: string): Promise<TenantLocalization> {
    const { settings } = await this.getTenantById.execute(tenantId);
    return { currency: settings.localization.currency, locale: settings.localization.language };
  }
}
