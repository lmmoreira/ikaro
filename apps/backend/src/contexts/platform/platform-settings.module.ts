import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedCacheModule } from '../../shared/infrastructure/cache/shared-cache.module';
import { TENANT_SETTINGS_PORT } from '../../shared/ports/tenant-settings.port';
import { TENANT_REPOSITORY } from './application/ports/tenant-repository.port';
import { GetTenantByIdUseCase } from './application/use-cases/get-tenant-by-id.use-case';
import { GetTenantsUseCase } from './application/use-cases/get-tenants.use-case';
import { TenantEntity } from './infrastructure/entities/tenant.entity';
import { PlatformTenantSettingsAdapter } from './infrastructure/cross-context/platform-tenant-settings.adapter';
import { CachingTenantRepository } from './infrastructure/repositories/caching-tenant.repository';
import { TypeOrmTenantRepository } from './infrastructure/repositories/typeorm-tenant.repository';

@Module({
  imports: [TypeOrmModule.forFeature([TenantEntity]), SharedCacheModule],
  providers: [
    TypeOrmTenantRepository,
    CachingTenantRepository,
    { provide: TENANT_REPOSITORY, useClass: CachingTenantRepository },
    { provide: TENANT_SETTINGS_PORT, useClass: PlatformTenantSettingsAdapter },
    GetTenantByIdUseCase,
    GetTenantsUseCase,
  ],
  exports: [GetTenantByIdUseCase, GetTenantsUseCase, TENANT_SETTINGS_PORT],
})
export class PlatformSettingsModule {}
