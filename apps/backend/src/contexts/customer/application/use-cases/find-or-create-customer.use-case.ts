import { Inject, Injectable } from '@nestjs/common';
import { Customer } from '../../domain/customer.aggregate';
import { FindOrCreateCustomerDto } from '../dtos/find-or-create-customer.dto';
import { CUSTOMER_REPOSITORY, ICustomerRepository } from '../ports/customer-repository.port';

export interface FindOrCreateCustomerResult {
  customerId: string;
  created: boolean;
}

@Injectable()
export class FindOrCreateCustomerUseCase {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository) {}

  async execute(dto: FindOrCreateCustomerDto): Promise<FindOrCreateCustomerResult> {
    const existing = await this.customerRepo.findByTenantAndOAuthId(
      dto.tenantId,
      dto.googleOAuthId,
    );
    if (existing) return { customerId: existing.id, created: false };

    const customer = Customer.create(dto.tenantId, dto.googleOAuthId, dto.email, dto.name);
    await this.customerRepo.save(customer);
    return { customerId: customer.id, created: true };
  }
}
