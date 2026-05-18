import { Inject, Injectable } from '@nestjs/common';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';
import { TenantInfoDto } from './get-tenant-by-id.use-case';

@Injectable()
export class GetTenantBySlugUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  async execute(slug: string): Promise<TenantInfoDto> {
    const tenant = await this.tenantRepo.findBySlug(slug);
    if (!tenant) throw new TenantNotFoundError(slug);
    return { id: tenant.id, slug: tenant.slug.value, name: tenant.name };
  }
}
