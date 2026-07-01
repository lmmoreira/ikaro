import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

export interface RenameTenantUseCaseInput {
  tenantId: string;
  name: string;
}

export interface RenameTenantUseCaseResult {
  tenantId: string;
  name: string;
}

@Injectable()
export class RenameTenantUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: RenameTenantUseCaseInput): Promise<RenameTenantUseCaseResult> {
    const { tenantId, name } = input;
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);

    tenant.updateName(name);

    await this.txManager.run(async () => {
      await this.tenantRepo.save(tenant);
    });

    return { tenantId: tenant.id, name: tenant.name };
  }
}
