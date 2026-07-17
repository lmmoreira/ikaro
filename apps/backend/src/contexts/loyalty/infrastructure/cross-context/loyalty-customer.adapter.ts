import { Injectable } from '@nestjs/common';
import { GetCustomerTenantsByIdUseCase } from '../../../customer/application/use-cases/get-customer-tenants-by-id.use-case';
import { LoyaltyCustomerNotFoundInTenantError } from '../../domain/errors/loyalty-domain.error';
import { ILoyaltyCustomerPort } from '../../application/ports/loyalty-customer.port';

@Injectable()
export class LoyaltyCustomerAdapter implements ILoyaltyCustomerPort {
  constructor(private readonly getCustomerTenantsById: GetCustomerTenantsByIdUseCase) {}

  async resolveCustomerIdByOAuthId(
    homeCustomerId: string,
    homeTenantId: string,
    targetTenantId: string,
  ): Promise<string> {
    let tenants;
    try {
      tenants = await this.getCustomerTenantsById.execute({
        customerId: homeCustomerId,
        tenantId: homeTenantId,
      });
    } catch {
      throw new LoyaltyCustomerNotFoundInTenantError();
    }
    const match = tenants.find((t) => t.tenantId === targetTenantId);
    if (!match) throw new LoyaltyCustomerNotFoundInTenantError();
    return match.customerId;
  }
}
