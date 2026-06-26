import { Inject, Injectable } from '@nestjs/common';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

export interface GetTenantsByIdsUseCaseResult {
  id: string;
  slug: string;
  name: string;
  locale: string;
}

@Injectable()
export class GetTenantsByIdsUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  async execute(tenantIds: string[]): Promise<GetTenantsByIdsUseCaseResult[]> {
    if (tenantIds.length === 0) return [];
    const tenants = await this.tenantRepo.findByIds(tenantIds);
    return tenants.map((t) => ({
      id: t.id,
      slug: t.slug.value,
      name: t.name,
      locale: t.settings.localization.language,
    }));
  }
}
