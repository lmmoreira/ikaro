import { Inject, Injectable } from '@nestjs/common';
import { CUSTOMER_REPOSITORY, ICustomerRepository } from '../ports/customer-repository.port';

export interface SearchCustomersUseCaseInput {
  tenantId: string;
  search?: string;
  limit: number;
}

export interface CustomerSearchItem {
  customerId: string;
  name: string;
  email: string;
}

export interface SearchCustomersUseCaseResult {
  items: CustomerSearchItem[];
  total: number;
}

@Injectable()
export class SearchCustomersUseCase {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository) {}

  async execute(dto: SearchCustomersUseCaseInput): Promise<SearchCustomersUseCaseResult> {
    const { rows, total } = await this.customerRepo.searchByTenant(
      dto.tenantId,
      dto.search,
      dto.limit,
    );
    return { items: rows, total };
  }
}
