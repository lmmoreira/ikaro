import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  HotsiteNotFoundError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import {
  FRONTEND_REVALIDATION_PORT,
  IFrontendRevalidationPort,
} from '../ports/frontend-revalidation.port';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

export interface PublishHotsiteUseCaseResult {
  isPublished: boolean;
}

@Injectable()
export class PublishHotsiteUseCase {
  constructor(
    @Inject(HOTSITE_CONFIG_REPOSITORY)
    private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(FRONTEND_REVALIDATION_PORT)
    private readonly frontendRevalidation: IFrontendRevalidationPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly tenantContext: RequestContext,
  ) {}

  async execute(): Promise<PublishHotsiteUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const config = await this.hotsiteConfigRepo.findByTenantId(tenantId);
    if (!config) throw new HotsiteNotFoundError(tenantId);

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);

    config.publish();

    await this.txManager.run(async () => {
      await this.hotsiteConfigRepo.save(config);
    });

    await this.frontendRevalidation.revalidate(tenant.slug.value);

    return { isPublished: config.isPublished };
  }
}
