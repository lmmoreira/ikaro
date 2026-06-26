import { Inject, Injectable } from '@nestjs/common';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

export interface GetTenantBookingConfigUseCaseResult {
  welcomeStaffScreenDays: number;
}

@Injectable()
export class GetTenantBookingConfigUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  async execute(tenantId: string): Promise<GetTenantBookingConfigUseCaseResult> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);
    return {
      welcomeStaffScreenDays: tenant.settings.booking.welcomeStaffScreenDays ?? 14,
    };
  }
}
