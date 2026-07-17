import { Injectable } from '@nestjs/common';
import { GetCustomerTenantsByIdUseCase } from '../../../customer/application/use-cases/get-customer-tenants-by-id.use-case';
import { CustomerNotFoundError } from '../../../customer/domain/errors/customer-domain.error';
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
    } catch (error) {
      // Only translate the known "home customer doesn't exist" case into the loyalty-owned
      // domain error. Any other failure (DB timeout, connection error, ...) is a real 500 —
      // rethrow it unchanged instead of masking it as a 404.
      if (error instanceof CustomerNotFoundError) {
        throw new LoyaltyCustomerNotFoundInTenantError();
      }
      throw error;
    }
    const match = tenants.find((t) => t.tenantId === targetTenantId);
    if (!match) throw new LoyaltyCustomerNotFoundInTenantError();
    return match.customerId;
  }
}
