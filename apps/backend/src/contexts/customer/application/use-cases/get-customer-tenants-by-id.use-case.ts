import { Inject, Injectable } from '@nestjs/common';
import { CustomerNotFoundError } from '../../domain/errors/customer-domain.error';
import {
  CustomerTenantSummary,
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../ports/customer-repository.port';

export interface GetCustomerTenantsByIdUseCaseInput {
  customerId: string;
  tenantId: string;
}

export type GetCustomerTenantsByIdUseCaseResult = CustomerTenantSummary[];

@Injectable()
export class GetCustomerTenantsByIdUseCase {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository) {}

  async execute(input: GetCustomerTenantsByIdUseCaseInput): Promise<GetCustomerTenantsByIdUseCaseResult> {
    const { customerId, tenantId } = input;
    const customer = await this.customerRepo.findById(customerId, tenantId);
    if (!customer) throw new CustomerNotFoundError(customerId);
    return this.customerRepo.findAllTenantsByOAuthId(customer.googleOAuthId);
  }
}
