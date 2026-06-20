import { Injectable } from '@nestjs/common';
import type { TenantSettingsProps } from '../../domain/value-objects/tenant-settings.vo';
import type { ITenantSettingsPort } from '../../../../shared/ports/tenant-settings.port';
import { GetTenantByIdUseCase } from '../../application/use-cases/get-tenant-by-id.use-case';

@Injectable()
export class PlatformTenantSettingsAdapter implements ITenantSettingsPort {
  constructor(private readonly getTenantById: GetTenantByIdUseCase) {}

  async getSettings(tenantId: string): Promise<TenantSettingsProps> {
    const { settings } = await this.getTenantById.execute(tenantId);
    return settings;
  }
}
