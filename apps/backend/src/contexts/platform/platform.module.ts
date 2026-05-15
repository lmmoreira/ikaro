import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HOTSITE_CONFIG_REPOSITORY, TENANT_REPOSITORY } from './application/ports';
import { HotsiteConfigEntity } from './infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from './infrastructure/entities/tenant.entity';
import { TypeOrmHotsiteConfigRepository } from './infrastructure/repositories/typeorm-hotsite-config.repository';
import { TypeOrmTenantRepository } from './infrastructure/repositories/typeorm-tenant.repository';

@Module({
  imports: [TypeOrmModule.forFeature([TenantEntity, HotsiteConfigEntity])],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: TypeOrmTenantRepository },
    { provide: HOTSITE_CONFIG_REPOSITORY, useClass: TypeOrmHotsiteConfigRepository },
  ],
  exports: [TENANT_REPOSITORY, HOTSITE_CONFIG_REPOSITORY],
})
export class PlatformModule {}
