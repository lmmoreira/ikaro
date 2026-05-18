import { Inject, Injectable } from '@nestjs/common';
import {
  CustomerTenantSummary,
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../ports/customer-repository.port';

export type GetCustomerTenantsResult = CustomerTenantSummary[];

@Injectable()
export class GetCustomerTenantsUseCase {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository) {}

  execute(googleOAuthId: string): Promise<GetCustomerTenantsResult> {
    return this.customerRepo.findAllTenantsByOAuthId(googleOAuthId);
  }
}
