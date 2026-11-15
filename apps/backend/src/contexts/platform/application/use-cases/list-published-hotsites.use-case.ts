import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  TENANT_ACCESS_PORT,
  type TenantAccessPort,
} from '../../../../shared/ports/tenant-access.port';
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
  private readonly logger = new AppLogger(ListPublishedHotsitesUseCase.name);

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(HOTSITE_CONFIG_REPOSITORY) private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
    @Inject(TENANT_ACCESS_PORT) private readonly tenantAccess: TenantAccessPort,
  ) {}

  async execute(): Promise<ListPublishedHotsitesUseCaseResult> {
    const suspendedIds = await this.readSuspendedIds();
    const tenants = (await this.tenantRepo.findAllActive()).filter((t) => !suspendedIds.has(t.id));
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

  // One batch read, never a per-tenant lookup. A failed read fails open: every published tenant is
  // listed, as before Billing existed.
  private async readSuspendedIds(): Promise<Set<string>> {
    try {
      return new Set(await this.tenantAccess.listSuspendedTenantIds());
    } catch (err) {
      this.logger.error(
        'Suspended tenant ids lookup failed; listing every published hotsite',
        err instanceof Error ? err.stack : String(err),
      );
      return new Set();
    }
  }
}
