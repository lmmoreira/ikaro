import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TENANT_SETTINGS_PORT } from '../../shared/ports/tenant-settings.port';
import { TENANT_REPOSITORY } from './application/ports/tenant-repository.port';
import { GetTenantByIdUseCase } from './application/use-cases/get-tenant-by-id.use-case';
import { TenantQueryService } from './application/services/tenant-query.service';
import { TenantEntity } from './infrastructure/entities/tenant.entity';
import { PlatformTenantSettingsAdapter } from './infrastructure/cross-context/platform-tenant-settings.adapter';
import { TypeOrmTenantRepository } from './infrastructure/repositories/typeorm-tenant.repository';

@Module({
  imports: [TypeOrmModule.forFeature([TenantEntity])],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: TypeOrmTenantRepository },
    { provide: TENANT_SETTINGS_PORT, useClass: PlatformTenantSettingsAdapter },
    GetTenantByIdUseCase,
    TenantQueryService,
  ],
  exports: [GetTenantByIdUseCase, TenantQueryService, TENANT_SETTINGS_PORT],
})
export class PlatformSettingsModule {}
