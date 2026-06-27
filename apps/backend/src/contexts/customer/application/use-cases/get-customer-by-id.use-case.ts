import { Inject, Injectable } from '@nestjs/common';
import { AddressProps } from '../../../../shared/value-objects/address';
import { CustomerNotFoundError } from '../../domain/errors/customer-domain.error';
import { CUSTOMER_REPOSITORY, ICustomerRepository } from '../ports/customer-repository.port';

export interface GetCustomerByIdUseCaseResult {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  phone: string | null;
  defaultAddress: AddressProps | null;
}

@Injectable()
export class GetCustomerByIdUseCase {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository) {}

  async execute(customerId: string, tenantId: string): Promise<GetCustomerByIdUseCaseResult> {
    const customer = await this.customerRepo.findById(customerId, tenantId);
    if (!customer) throw new CustomerNotFoundError(customerId);
    return {
      id: customer.id,
      tenantId: customer.tenantId,
      email: customer.email.address,
      name: customer.name,
      phone: customer.phone?.value ?? null,
      defaultAddress: customer.defaultAddress?.toJSON() ?? null,
    };
  }
}
