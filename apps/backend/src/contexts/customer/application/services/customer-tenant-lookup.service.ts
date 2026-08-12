import { Inject, Injectable } from '@nestjs/common';
import {
  CUSTOMER_REPOSITORY,
  CustomerTenantSummary,
  ICustomerRepository,
} from '../ports/customer-repository.port';
import {
  CustomerTenantLookupInput,
  ICustomerTenantLookup,
} from '../ports/customer-tenant-lookup.port';

@Injectable()
export class CustomerTenantLookupService implements ICustomerTenantLookup {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository) {}

  async find(input: CustomerTenantLookupInput): Promise<CustomerTenantSummary[] | null> {
    const customer = await this.customerRepo.findById(input.customerId, input.tenantId);
    if (!customer) return null;
    return this.customerRepo.findAllTenantsByOAuthId(customer.googleOAuthId);
  }
}
