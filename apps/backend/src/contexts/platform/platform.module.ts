import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '../../shared/tenant/tenant.module';
import { HOTSITE_CONFIG_REPOSITORY } from './application/ports/hotsite-config-repository.port';
import { TENANT_REPOSITORY } from './application/ports/tenant-repository.port';
import { GetHotsiteManifestUseCase } from './application/use-cases/get-hotsite-manifest.use-case';
import { GetTenantByIdUseCase } from './application/use-cases/get-tenant-by-id.use-case';
import { GetTenantBySlugUseCase } from './application/use-cases/get-tenant-by-slug.use-case';
import { ProvisionTenantUseCase } from './application/use-cases/provision-tenant.use-case';
import { UpdateTenantSettingsUseCase } from './application/use-cases/update-tenant-settings.use-case';
import { HotsiteConfigEntity } from './infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from './infrastructure/entities/tenant.entity';
import { HotsiteController } from './infrastructure/controllers/hotsite.controller';
import { InternalTenantController } from './infrastructure/controllers/internal-tenant.controller';
import { InternalTenantReadController } from './infrastructure/controllers/internal-tenant-read.controller';
import { TenantSettingsController } from './infrastructure/controllers/tenant-settings.controller';
import { TypeOrmHotsiteConfigRepository } from './infrastructure/repositories/typeorm-hotsite-config.repository';
import { TypeOrmTenantRepository } from './infrastructure/repositories/typeorm-tenant.repository';

@Module({
  imports: [TypeOrmModule.forFeature([TenantEntity, HotsiteConfigEntity]), TenantModule],
  controllers: [
    HotsiteController,
    InternalTenantController,
    InternalTenantReadController,
    TenantSettingsController,
  ],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: TypeOrmTenantRepository },
    { provide: HOTSITE_CONFIG_REPOSITORY, useClass: TypeOrmHotsiteConfigRepository },
    GetHotsiteManifestUseCase,
    GetTenantByIdUseCase,
    GetTenantBySlugUseCase,
    ProvisionTenantUseCase,
    UpdateTenantSettingsUseCase,
  ],
  exports: [GetTenantByIdUseCase],
})
export class PlatformModule {}
