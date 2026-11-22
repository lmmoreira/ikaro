import { Inject, Injectable } from '@nestjs/common';
import {
  ITenantRepository,
  TENANT_REPOSITORY,
  TenantAgeCursor,
} from '../ports/tenant-repository.port';

export interface ListTenantsCreatedBeforeUseCaseInput {
  cutoff: Date;
  limit: number;
  /** The `(createdAt, id)` of the last row of the previous page; omit for the first page. */
  after?: TenantAgeCursor;
}

/** The same six values as `GetTenantBillingInfoUseCase`, and nothing else. */
export interface ListedTenant {
  tenantId: string;
  slug: string;
  countryCode: string;
  timezone: string;
  createdAt: Date;
  isActive: boolean;
}

export type ListTenantsCreatedBeforeUseCaseResult = ListedTenant[];

/**
 * The read-only keyset page Billing's self-heal job (UC-140) walks to find tenants with no
 * subscription: tenants created before a cutoff, oldest first, active and inactive alike (the
 * caller decides what to skip). Billing diffs the page against its own subscriptions, so no query
 * joins across contexts. M26-S08.
 */
@Injectable()
export class ListTenantsCreatedBeforeUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  async execute(
    input: ListTenantsCreatedBeforeUseCaseInput,
  ): Promise<ListTenantsCreatedBeforeUseCaseResult> {
    const tenants = await this.tenantRepo.findCreatedBefore(input.cutoff, input.limit, input.after);
    return tenants.map((tenant) => ({
      tenantId: tenant.id,
      slug: tenant.slug.value,
      countryCode: tenant.settings.localization.countryCode,
      timezone: tenant.settings.businessHours.timezone,
      createdAt: tenant.createdAt,
      isActive: tenant.isActive,
    }));
  }
}
