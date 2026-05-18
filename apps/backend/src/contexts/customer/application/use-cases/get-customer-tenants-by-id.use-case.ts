import { Inject, Injectable } from '@nestjs/common';
import { CustomerNotFoundError } from '../../domain/errors/customer-domain.error';
import {
  CustomerTenantSummary,
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../ports/customer-repository.port';

@Injectable()
export class GetCustomerTenantsByIdUseCase {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository) {}

  async execute(customerId: string, tenantId: string): Promise<CustomerTenantSummary[]> {
    const customer = await this.customerRepo.findById(customerId, tenantId);
    if (!customer) throw new CustomerNotFoundError(customerId);
    return this.customerRepo.findAllTenantsByOAuthId(customer.googleOAuthId);
  }
}
