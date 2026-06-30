import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { deepMerge } from '../../../../shared/utils/deep-merge';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { TenantSettings, TenantSettingsProps } from '../../domain/value-objects/tenant-settings.vo';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

type DeepPartial<T> = {
  [K in keyof T]?: NonNullable<T[K]> extends object
    ? DeepPartial<NonNullable<T[K]>> | Extract<T[K], null>
    : T[K];
};

export interface UpdateTenantSettingsUseCaseInput {
  tenantId: string;
  settings: DeepPartial<TenantSettingsProps>;
}

export interface UpdateTenantSettingsUseCaseResult {
  tenantId: string;
  name: string;
  settings: TenantSettingsProps;
}

@Injectable()
export class UpdateTenantSettingsUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: UpdateTenantSettingsUseCaseInput): Promise<UpdateTenantSettingsUseCaseResult> {
    const { tenantId, settings } = input;
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);

    const merged = deepMerge(
      tenant.settings.toJSON(),
      settings as Partial<TenantSettingsProps>,
    );
    tenant.updateSettings(TenantSettings.create(merged));

    await this.txManager.run(async () => {
      await this.tenantRepo.save(tenant);
    });

    return {
      tenantId: tenant.id,
      name: tenant.name,
      settings: tenant.settings.toJSON(),
    };
  }
}
