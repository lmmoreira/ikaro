import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CUSTOMER_REPOSITORY } from './application/ports/customer-repository.port';
import { FindOrCreateCustomerUseCase } from './application/use-cases/find-or-create-customer.use-case';
import { GetCustomerTenantsUseCase } from './application/use-cases/get-customer-tenants.use-case';
import { InternalCustomerController } from './infrastructure/controllers/internal-customer.controller';
import { CustomerEntity } from './infrastructure/entities/customer.entity';
import { TypeOrmCustomerRepository } from './infrastructure/repositories/typeorm-customer.repository';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerEntity])],
  controllers: [InternalCustomerController],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository },
    FindOrCreateCustomerUseCase,
    GetCustomerTenantsUseCase,
  ],
})
export class CustomerModule {}
