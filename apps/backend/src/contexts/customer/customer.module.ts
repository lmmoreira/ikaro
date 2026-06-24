import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { RequestModule } from '../../shared/request/request.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { CUSTOMER_LOYALTY_PORT } from './application/ports/customer-loyalty.port';
import { CUSTOMER_REPOSITORY } from './application/ports/customer-repository.port';
import { CustomerQueryService } from './application/services/customer-query.service';
import { FindOrCreateCustomerUseCase } from './application/use-cases/find-or-create-customer.use-case';
import { GetCustomerProfileUseCase } from './application/use-cases/get-customer-profile.use-case';
import { GetCustomerTenantsByIdUseCase } from './application/use-cases/get-customer-tenants-by-id.use-case';
import { GetCustomerTenantsUseCase } from './application/use-cases/get-customer-tenants.use-case';
import { SearchCustomersUseCase } from './application/use-cases/search-customers.use-case';
import { UpdateCustomerProfileUseCase } from './application/use-cases/update-customer-profile.use-case';
import { CustomerController } from './infrastructure/controllers/customer.controller';
import { InternalCustomerController } from './infrastructure/controllers/internal-customer.controller';
import { CustomerLoyaltyAdapter } from './infrastructure/cross-context/customer-loyalty.adapter';
import { CustomerEntity } from './infrastructure/entities/customer.entity';
import { TypeOrmCustomerRepository } from './infrastructure/repositories/typeorm-customer.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerEntity]),
    RequestModule,
    TransactionManagerModule,
    LoyaltyModule,
  ],
  controllers: [InternalCustomerController, CustomerController],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository },
    { provide: CUSTOMER_LOYALTY_PORT, useClass: CustomerLoyaltyAdapter },
    CustomerQueryService,
    FindOrCreateCustomerUseCase,
    GetCustomerTenantsUseCase,
    GetCustomerTenantsByIdUseCase,
    GetCustomerProfileUseCase,
    UpdateCustomerProfileUseCase,
    SearchCustomersUseCase,
  ],
  exports: [CustomerQueryService],
})
export class CustomerModule {}
