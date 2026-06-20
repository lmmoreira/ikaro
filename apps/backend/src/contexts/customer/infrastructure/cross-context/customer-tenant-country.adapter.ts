import { Injectable } from '@nestjs/common';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { ITenantCountryPort } from '../../application/ports/tenant-country.port';

@Injectable()
export class CustomerTenantCountryAdapter implements ITenantCountryPort {
  constructor(private readonly getTenantById: GetTenantByIdUseCase) {}

  async getCountryCode(tenantId: string): Promise<string> {
    const { settings } = await this.getTenantById.execute(tenantId);
    return settings.localization.country_code;
  }
}
