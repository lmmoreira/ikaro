import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { AuthModule } from '../auth/auth.module';
import { HotsiteAdminController } from './hotsite-admin.controller';
import { HotsiteTemplatesController } from './hotsite-templates.controller';
import { LeadFormController } from './lead-form.controller';
import { PlatformPublicController } from './platform.public.controller';
import { SignupPublicController } from './signup.public.controller';
import { SignupService } from './signup.service';
import { TenantController } from './tenant.controller';
import { TenantSettingsController } from './tenant-settings.controller';

@Module({
  imports: [BackendHttpModule, AuthModule],
  providers: [SignupService],
  controllers: [
    PlatformPublicController,
    SignupPublicController,
    HotsiteAdminController,
    HotsiteTemplatesController,
    LeadFormController,
    TenantController,
    TenantSettingsController,
  ],
})
export class PlatformModule {}
