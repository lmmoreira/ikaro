import { Inject, Injectable } from '@nestjs/common';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

export interface GetTenantBillingInfoUseCaseInput {
  tenantId: string;
}

export interface GetTenantBillingInfoUseCaseResult {
  tenantId: string;
  slug: string;
  countryCode: string;
  timezone: string;
  createdAt: Date;
}

/**
 * The narrow, stable read Billing needs about a tenant (M25-S13): exactly these five values and
 * nothing else. `GetTenantByIdUseCase` returns the whole `settings` blob and no `createdAt`.
 */
@Injectable()
export class GetTenantBillingInfoUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  async execute(
    input: GetTenantBillingInfoUseCaseInput,
  ): Promise<GetTenantBillingInfoUseCaseResult> {
    const tenant = await this.tenantRepo.findById(input.tenantId);
    if (!tenant) throw new TenantNotFoundError(input.tenantId);
    return {
      tenantId: tenant.id,
      slug: tenant.slug.value,
      countryCode: tenant.settings.localization.countryCode,
      timezone: tenant.settings.businessHours.timezone,
      createdAt: tenant.createdAt,
    };
  }
}
