import { Inject, Injectable } from '@nestjs/common';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

export interface GetTenantBySlugUseCaseInput {
  slug: string;
}

export interface GetTenantBySlugUseCaseResult {
  id: string;
  slug: string;
  name: string;
  locale: string;
}

@Injectable()
export class GetTenantBySlugUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  async execute(input: GetTenantBySlugUseCaseInput): Promise<GetTenantBySlugUseCaseResult> {
    const { slug } = input;
    const tenant = await this.tenantRepo.findBySlug(slug);
    if (!tenant) throw new TenantNotFoundError(slug);
    return {
      id: tenant.id,
      slug: tenant.slug.value,
      name: tenant.name,
      locale: tenant.settings.localization.language,
    };
  }
}
