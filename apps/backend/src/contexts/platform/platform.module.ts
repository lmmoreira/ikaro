import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingModule } from '../booking/booking.module';
import { StorageModule } from '../../shared/infrastructure/storage.module';
import { TenantModule } from '../../shared/tenant/tenant.module';
import { BOOKING_LOOKUP_PORT } from './application/ports/booking-lookup.port';
import { FRONTEND_REVALIDATION_PORT } from './application/ports/frontend-revalidation.port';
import { HOTSITE_CONFIG_REPOSITORY } from './application/ports/hotsite-config-repository.port';
import { TENANT_REPOSITORY } from './application/ports/tenant-repository.port';
import { HotsiteImagePathsService } from './domain/services/hotsite-image-paths.service';
import { HotsiteImageUrlResolver } from './domain/services/hotsite-image-url-resolver.service';
import { FeatureBookingPhotoUseCase } from './application/use-cases/feature-booking-photo.use-case';
import { GenerateHotsiteImageSignedUrlUseCase } from './application/use-cases/generate-hotsite-image-signed-url.use-case';
import { GetHotsiteContentUseCase } from './application/use-cases/get-hotsite-content.use-case';
import { GetHotsiteManifestUseCase } from './application/use-cases/get-hotsite-manifest.use-case';
import { GetTenantByIdUseCase } from './application/use-cases/get-tenant-by-id.use-case';
import { GetTenantBySlugUseCase } from './application/use-cases/get-tenant-by-slug.use-case';
import { ProvisionTenantUseCase } from './application/use-cases/provision-tenant.use-case';
import { PublishHotsiteUseCase } from './application/use-cases/publish-hotsite.use-case';
import { UnpublishHotsiteUseCase } from './application/use-cases/unpublish-hotsite.use-case';
import { UpdateHotsiteContentUseCase } from './application/use-cases/update-hotsite-content.use-case';
import { UpdateTenantSettingsUseCase } from './application/use-cases/update-tenant-settings.use-case';
import { HotsiteConfigEntity } from './infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from './infrastructure/entities/tenant.entity';
import { FrontendRevalidationAdapter } from './infrastructure/adapters/frontend-revalidation.adapter';
import { BookingLookupAdapter } from './infrastructure/cross-context/booking-lookup.adapter';
import { HotsiteAdminController } from './infrastructure/controllers/hotsite-admin.controller';
import { HotsiteController } from './infrastructure/controllers/hotsite.controller';
import { InternalTenantController } from './infrastructure/controllers/internal-tenant.controller';
import { InternalTenantReadController } from './infrastructure/controllers/internal-tenant-read.controller';
import { TenantSettingsController } from './infrastructure/controllers/tenant-settings.controller';
import { TypeOrmHotsiteConfigRepository } from './infrastructure/repositories/typeorm-hotsite-config.repository';
import { TypeOrmTenantRepository } from './infrastructure/repositories/typeorm-tenant.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantEntity, HotsiteConfigEntity]),
    TenantModule,
    StorageModule,
    BookingModule,
  ],
  controllers: [
    HotsiteAdminController,
    HotsiteController,
    InternalTenantController,
    InternalTenantReadController,
    TenantSettingsController,
  ],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: TypeOrmTenantRepository },
    { provide: HOTSITE_CONFIG_REPOSITORY, useClass: TypeOrmHotsiteConfigRepository },
    { provide: BOOKING_LOOKUP_PORT, useClass: BookingLookupAdapter },
    { provide: FRONTEND_REVALIDATION_PORT, useClass: FrontendRevalidationAdapter },
    HotsiteImagePathsService,
    HotsiteImageUrlResolver,
    FeatureBookingPhotoUseCase,
    GenerateHotsiteImageSignedUrlUseCase,
    GetHotsiteContentUseCase,
    GetHotsiteManifestUseCase,
    GetTenantByIdUseCase,
    GetTenantBySlugUseCase,
    ProvisionTenantUseCase,
    PublishHotsiteUseCase,
    UnpublishHotsiteUseCase,
    UpdateHotsiteContentUseCase,
    UpdateTenantSettingsUseCase,
  ],
  exports: [GetTenantByIdUseCase],
})
export class PlatformModule {}
