import { Inject, Injectable } from '@nestjs/common';
import {
  ITenantRepository,
  TENANT_REPOSITORY,
  TenantStatusFilter,
} from '../ports/tenant-repository.port';

export interface GetTenantsDto {
  ids?: string[];
  status?: TenantStatusFilter;
  name?: string;
  slug?: string;
  limit?: number;
  offset?: number;
}

export interface TenantItemResult {
  id: string;
  slug: string;
  name: string;
  locale: string;
  timezone: string;
  isActive: boolean;
}

export interface GetTenantsUseCaseResult {
  items: TenantItemResult[];
}

@Injectable()
export class GetTenantsUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  async execute(dto: GetTenantsDto = {}): Promise<GetTenantsUseCaseResult> {
    const tenants = await this.tenantRepo.findMany(dto);
    return {
      items: tenants.map((t) => ({
        id: t.id,
        slug: t.slug.value,
        name: t.name,
        locale: t.settings.localization.language,
        timezone: t.settings.businessHours?.timezone ?? 'UTC',
        isActive: t.isActive,
      })),
    };
  }
}
