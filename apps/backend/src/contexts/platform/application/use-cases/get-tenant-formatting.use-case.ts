import { Inject, Injectable } from '@nestjs/common';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

export interface GetTenantFormattingUseCaseResult {
  locale: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  timeFormat: '24h' | '12h';
}

@Injectable()
export class GetTenantFormattingUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  async execute(tenantId: string): Promise<GetTenantFormattingUseCaseResult> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);
    const resolved = tenant.settings.resolveLocalization();
    return {
      locale: resolved.language,
      currency: resolved.currency,
      timezone: tenant.settings.businessHours.timezone,
      dateFormat: resolved.dateFormat,
      timeFormat: resolved.timeFormat,
    };
  }
}
