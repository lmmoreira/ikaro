import { Inject, Injectable } from '@nestjs/common';
import { AddressProps } from '../../../../shared/value-objects/address';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { CustomerNotFoundError } from '../../domain/errors/customer-domain.error';
import { CUSTOMER_REPOSITORY, ICustomerRepository } from '../ports/customer-repository.port';

export type GetCustomerProfileUseCaseResult = {
  customerId: string;
  email: string;
  name: string;
  phone: string | null;
  defaultAddress: AddressProps | null;
};

@Injectable()
export class GetCustomerProfileUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(): Promise<GetCustomerProfileUseCaseResult> {
    const customerId = this.tenantContext.actorId!;
    const { tenantId } = this.tenantContext;
    const customer = await this.customerRepo.findById(customerId, tenantId);
    if (!customer) throw new CustomerNotFoundError(customerId);
    return {
      customerId: customer.id,
      email: customer.email.address,
      name: customer.name,
      phone: customer.phone?.value ?? null,
      defaultAddress: customer.defaultAddress?.toJSON() ?? null,
    };
  }
}
