import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';
import { RenameTenantDto } from '../dtos/rename-tenant.dto';

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

  async execute(tenantId: string, dto: RenameTenantDto): Promise<RenameTenantUseCaseResult> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);

    tenant.updateName(dto.name);

    await this.txManager.run(async () => {
      await this.tenantRepo.save(tenant);
    });

    return { tenantId: tenant.id, name: tenant.name };
  }
}
