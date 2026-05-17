import { Inject, Injectable } from '@nestjs/common';
import { deepMerge } from '../../../../shared/utils/deep-merge';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { TenantSettings, TenantSettingsProps } from '../../domain/value-objects/tenant-settings.vo';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';
import { UpdateTenantSettingsDto } from '../dtos/update-tenant-settings.dto';

export interface UpdateTenantSettingsResult {
  tenantId: string;
  name: string;
  settings: TenantSettingsProps;
}

@Injectable()
export class UpdateTenantSettingsUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  async execute(
    tenantId: string,
    dto: UpdateTenantSettingsDto,
  ): Promise<UpdateTenantSettingsResult> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);

    if (dto.name !== undefined) {
      tenant.updateName(dto.name);
    }

    if (dto.settings !== undefined) {
      const merged = deepMerge(
        tenant.settings.toJSON(),
        dto.settings as Partial<TenantSettingsProps>,
      );
      tenant.updateSettings(TenantSettings.create(merged));
    }

    await this.tenantRepo.save(tenant);

    return {
      tenantId: tenant.id,
      name: tenant.name,
      settings: tenant.settings.toJSON(),
    };
  }
}
