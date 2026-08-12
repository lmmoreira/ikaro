import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Customer } from '../../domain/customer.aggregate';
import { FindOrCreateCustomerDto } from '../dtos/find-or-create-customer.dto';
import { CUSTOMER_REPOSITORY, ICustomerRepository } from '../ports/customer-repository.port';

export type FindOrCreateCustomerUseCaseInput = FindOrCreateCustomerDto;

export interface FindOrCreateCustomerUseCaseResult {
  customerId: string;
  created: boolean;
}

@Injectable()
export class FindOrCreateCustomerUseCase {
  private readonly logger = new AppLogger(FindOrCreateCustomerUseCase.name);

  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: FindOrCreateCustomerUseCaseInput,
  ): Promise<FindOrCreateCustomerUseCaseResult> {
    const existing = await this.customerRepo.findByTenantAndOAuthId(
      input.tenantId,
      input.googleOAuthId,
    );
    if (existing) {
      this.logger.log('Customer login', { tenantId: input.tenantId, customerId: existing.id });
      return { customerId: existing.id, created: false };
    }

    const customer = Customer.create(input.tenantId, input.googleOAuthId, input.email, input.name);
    await this.txManager.run(async () => {
      await this.customerRepo.save(customer);
    });
    this.logger.log('Customer login', { tenantId: input.tenantId, customerId: customer.id });
    return { customerId: customer.id, created: true };
  }
}
