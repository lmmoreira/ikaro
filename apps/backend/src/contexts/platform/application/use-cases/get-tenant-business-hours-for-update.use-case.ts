import { Inject, Injectable } from '@nestjs/common';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

export interface GetTenantBusinessHoursForUpdateUseCaseInput {
  tenantId: string;
}

export interface GetTenantBusinessHoursForUpdateUseCaseResult {
  businessHours: BusinessHours;
  locale: string;
}

// The uncached, transactional counterpart to GetTenantByIdUseCase — that use case stays
// cache-backed (via CachingTenantRepository) for its many other, non-transactional callers.
// This one must be called inside an active ITransactionManager.run() block: findByIdForUpdate
// throws otherwise. It bypasses the cache entirely and takes a real Postgres row lock
// (pessimistic_write), so a caller validating against businessHours mid-transaction can't
// observe a value a concurrent UpdateTenantSettingsUseCase (which takes the same row lock) is
// about to overwrite — mirrors UpdateHotsiteContentUseCase's existing findByIdForUpdate usage
// for the same class of cross-aggregate invariant (Codex PR #460 round-7 finding: the earlier
// advisory-lock design here didn't protect against this, since the "fresh" read still went
// through the cache regardless of lock ordering).
@Injectable()
export class GetTenantBusinessHoursForUpdateUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  async execute(
    input: GetTenantBusinessHoursForUpdateUseCaseInput,
  ): Promise<GetTenantBusinessHoursForUpdateUseCaseResult> {
    const tenant = await this.tenantRepo.findByIdForUpdate(input.tenantId);
    if (!tenant) throw new TenantNotFoundError(input.tenantId);
    return {
      businessHours: tenant.settings.businessHours,
      locale: tenant.settings.localization.language,
    };
  }
}
