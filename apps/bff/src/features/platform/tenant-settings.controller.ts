import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { ChatbotCapStatusResponse, TenantSettingsResponse } from '@ikaro/types';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import {
  UpdateTenantSettingsBody,
  UpdateTenantSettingsBodySchema,
} from './tenant-settings.schemas';

// Request Zod schema moved to tenant-settings.schemas.ts — re-exported here so
// existing imports of these symbols from this file (e.g. address-schema-code-reuse.spec.ts)
// keep working unchanged.
export * from './tenant-settings.schemas';

@Controller('tenants')
export class TenantSettingsController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get('settings')
  @Roles('STAFF', 'MANAGER')
  getSettings(): Promise<TenantSettingsResponse> {
    return this.backendHttp.get<TenantSettingsResponse>('/tenants/settings');
  }

  @Patch('settings')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER')
  updateSettings(
    @Body(new ZodValidationPipe(UpdateTenantSettingsBodySchema)) body: UpdateTenantSettingsBody,
  ): Promise<TenantSettingsResponse> {
    return this.backendHttp.patch<TenantSettingsResponse>('/tenants/settings', body);
  }

  @Get('chatbot/cap-status')
  @Roles('MANAGER')
  getChatbotCapStatus(): Promise<ChatbotCapStatusResponse> {
    return this.backendHttp.get<ChatbotCapStatusResponse>('/tenants/chatbot/cap-status');
  }
}
