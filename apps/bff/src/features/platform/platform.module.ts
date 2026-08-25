import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { HotsiteAdminController } from './hotsite-admin.controller';
import { LeadFormController } from './lead-form.controller';
import { PlatformPublicController } from './platform.public.controller';
import { TenantController } from './tenant.controller';
import { TenantSettingsController } from './tenant-settings.controller';
import { TurnstileService } from './turnstile.service';

@Module({
  // HttpModule imported directly (not just via BackendHttpModule) — BackendHttpModule only
  // exports BackendHttpService, not the underlying HttpService, and TurnstileService (M20-S05)
  // needs the raw HttpService to call Cloudflare's siteverify API directly.
  imports: [BackendHttpModule, HttpModule],
  controllers: [
    PlatformPublicController,
    HotsiteAdminController,
    LeadFormController,
    TenantController,
    TenantSettingsController,
  ],
  providers: [TurnstileService],
})
export class PlatformModule {}
