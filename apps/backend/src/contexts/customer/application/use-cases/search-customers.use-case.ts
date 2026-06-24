import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../../../shared/request/request-context';
import { CUSTOMER_LOYALTY_PORT, ICustomerLoyaltyPort } from '../ports/customer-loyalty.port';
import { CUSTOMER_REPOSITORY, ICustomerRepository } from '../ports/customer-repository.port';

export interface SearchCustomersDto {
  search?: string;
  limit: number;
}

export interface CustomerSearchItem {
  customerId: string;
  name: string;
  email: string;
  currentPoints: number;
}

export interface SearchCustomersUseCaseResult {
  items: CustomerSearchItem[];
  total: number;
}

@Injectable()
export class SearchCustomersUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository,
    @Inject(CUSTOMER_LOYALTY_PORT) private readonly loyaltyPort: ICustomerLoyaltyPort,
    private readonly tenantContext: RequestContext,
  ) {}

  async execute(dto: SearchCustomersDto): Promise<SearchCustomersUseCaseResult> {
    const { tenantId } = this.tenantContext;
    const { rows, total } = await this.customerRepo.searchByTenant(tenantId, dto.search, dto.limit);
    const items = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        currentPoints: await this.loyaltyPort.getCurrentPoints(tenantId, row.customerId),
      })),
    );
    return { items, total };
  }
}
