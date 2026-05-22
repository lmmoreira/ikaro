import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TENANT_REPOSITORY } from './application/ports/tenant-repository.port';
import { GetTenantByIdUseCase } from './application/use-cases/get-tenant-by-id.use-case';
import { TenantEntity } from './infrastructure/entities/tenant.entity';
import { TypeOrmTenantRepository } from './infrastructure/repositories/typeorm-tenant.repository';

@Module({
  imports: [TypeOrmModule.forFeature([TenantEntity])],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: TypeOrmTenantRepository },
    GetTenantByIdUseCase,
  ],
  exports: [GetTenantByIdUseCase],
})
export class PlatformSettingsModule {}
