import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { HotsiteAdminController } from './hotsite-admin.controller';
import { PlatformPublicController } from './platform.public.controller';
import { TenantController } from './tenant.controller';
import { TenantSettingsController } from './tenant-settings.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [
    PlatformPublicController,
    HotsiteAdminController,
    TenantController,
    TenantSettingsController,
  ],
})
export class PlatformModule {}
