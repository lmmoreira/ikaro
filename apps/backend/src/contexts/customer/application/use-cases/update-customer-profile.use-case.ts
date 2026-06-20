import { Inject, Injectable } from '@nestjs/common';
import { countrySpec } from '@ikaro/i18n';
import { Address, AddressProps } from '../../../../shared/value-objects/address';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  TRANSACTION_MANAGER,
  ITransactionManager,
} from '../../../../shared/ports/transaction-manager.port';
import { CustomerNotFoundError } from '../../domain/errors/customer-domain.error';
import { CUSTOMER_REPOSITORY, ICustomerRepository } from '../ports/customer-repository.port';
import { UpdateCustomerProfileDto } from '../dtos/update-customer-profile.dto';

export type UpdateCustomerProfileUseCaseResult = {
  customerId: string;
  email: string;
  name: string;
  phone: string | null;
  defaultAddress: AddressProps | null;
};

@Injectable()
export class UpdateCustomerProfileUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly tenantContext: RequestContext,
  ) {}

  async execute(dto: UpdateCustomerProfileDto): Promise<UpdateCustomerProfileUseCaseResult> {
    const customerId = this.tenantContext.actorId!;
    const { tenantId } = this.tenantContext;

    const customer = await this.customerRepo.findById(customerId, tenantId);
    if (!customer) throw new CustomerNotFoundError(customerId);

    const name = dto.name ?? customer.name;
    const phone = dto.phone === undefined ? (customer.phone?.value ?? null) : dto.phone;

    let defaultAddress: Address | null;
    if (dto.defaultAddress === undefined) {
      defaultAddress = customer.defaultAddress;
    } else if (dto.defaultAddress === null) {
      defaultAddress = null;
    } else {
      const countryCode = this.tenantContext.settings.localization.country_code;
      defaultAddress = Address.create(
        { ...dto.defaultAddress, complement: dto.defaultAddress.complement ?? undefined },
        countrySpec(countryCode).address,
      );
    }

    customer.updateProfile(name, phone, defaultAddress);

    await this.txManager.run(() => this.customerRepo.save(customer));

    return {
      customerId: customer.id,
      email: customer.email.address,
      name: customer.name,
      phone: customer.phone?.value ?? null,
      defaultAddress: customer.defaultAddress?.toJSON() ?? null,
    };
  }
}
