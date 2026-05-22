import { Injectable } from '@nestjs/common';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { BusinessHours } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { IScheduleTenantSettingsPort } from '../../application/ports/schedule-tenant-settings.port';

@Injectable()
export class ScheduleTenantSettingsAdapter implements IScheduleTenantSettingsPort {
  constructor(private readonly getTenantById: GetTenantByIdUseCase) {}

  async getBusinessHours(tenantId: string): Promise<BusinessHours> {
    const { settings } = await this.getTenantById.execute(tenantId);
    return settings.business_hours;
  }
}
