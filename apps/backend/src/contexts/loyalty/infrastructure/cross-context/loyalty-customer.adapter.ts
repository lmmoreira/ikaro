import { Inject, Injectable } from '@nestjs/common';
import {
  CUSTOMER_TENANT_LOOKUP,
  ICustomerTenantLookup,
} from '../../../customer/application/ports/customer-tenant-lookup.port';
import { LoyaltyCustomerNotFoundInTenantError } from '../../domain/errors/loyalty-domain.error';
import {
  ILoyaltyCustomerPort,
  LoyaltyCustomerTenantPair,
} from '../../application/ports/loyalty-customer.port';

@Injectable()
export class LoyaltyCustomerAdapter implements ILoyaltyCustomerPort {
  constructor(
    @Inject(CUSTOMER_TENANT_LOOKUP) private readonly customerTenantLookup: ICustomerTenantLookup,
  ) {}

  async resolveCustomerIdByOAuthId(
    homeCustomerId: string,
    homeTenantId: string,
    targetTenantId: string,
  ): Promise<string> {
    const tenants = await this.fetchTenants(homeCustomerId, homeTenantId);
    const match = tenants.find((t) => t.tenantId === targetTenantId);
    if (!match) throw new LoyaltyCustomerNotFoundInTenantError();
    return match.customerId;
  }

  async resolveAllTenantsByOAuthId(
    homeCustomerId: string,
    homeTenantId: string,
  ): Promise<LoyaltyCustomerTenantPair[]> {
    return this.fetchTenants(homeCustomerId, homeTenantId);
  }

  private async fetchTenants(
    homeCustomerId: string,
    homeTenantId: string,
  ): Promise<LoyaltyCustomerTenantPair[]> {
    const tenants = await this.customerTenantLookup.find({
      customerId: homeCustomerId,
      tenantId: homeTenantId,
    });
    if (!tenants) throw new LoyaltyCustomerNotFoundInTenantError();
    return tenants;
  }
}
