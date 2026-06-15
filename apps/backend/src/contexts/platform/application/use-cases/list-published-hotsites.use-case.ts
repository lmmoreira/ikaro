import { Inject, Injectable } from '@nestjs/common';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

export interface PublishedHotsiteResult {
  slug: string;
  updatedAt: string;
}

export interface ListPublishedHotsitesUseCaseResult {
  items: PublishedHotsiteResult[];
}

@Injectable()
export class ListPublishedHotsitesUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(HOTSITE_CONFIG_REPOSITORY) private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
  ) {}

  async execute(): Promise<ListPublishedHotsitesUseCaseResult> {
    const tenants = await this.tenantRepo.findAllActive();
    const configs = await this.hotsiteConfigRepo.findByTenantIds(tenants.map((t) => t.id));
    const configByTenantId = new Map(configs.map((config) => [config.tenantId, config]));

    const items: PublishedHotsiteResult[] = [];
    for (const tenant of tenants) {
      const config = configByTenantId.get(tenant.id);
      if (config?.isPublished) {
        items.push({ slug: tenant.slug.value, updatedAt: config.updatedAt.toISOString() });
      }
    }

    return { items };
  }
}
