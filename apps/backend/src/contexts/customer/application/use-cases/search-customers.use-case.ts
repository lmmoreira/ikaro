import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../../../shared/request/request-context';
import { CUSTOMER_REPOSITORY, ICustomerRepository } from '../ports/customer-repository.port';

export interface SearchCustomersDto {
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
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository,
    private readonly tenantContext: RequestContext,
  ) {}

  async execute(dto: SearchCustomersDto): Promise<SearchCustomersUseCaseResult> {
    const { tenantId } = this.tenantContext;
    const { rows, total } = await this.customerRepo.searchByTenant(tenantId, dto.search, dto.limit);
    return { items: rows, total };
  }
}
