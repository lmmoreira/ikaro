import { Body, Controller, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  UpdateTenantSettingsDto,
  UpdateTenantSettingsSchema,
} from '../../application/dtos/update-tenant-settings.dto';
import {
  UpdateTenantSettingsUseCaseResult,
  UpdateTenantSettingsUseCase,
} from '../../application/use-cases/update-tenant-settings.use-case';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { mapPlatformError } from '../http/platform-error.mapper';

@Controller('tenants')
@UseGuards(ManagerRoleGuard)
export class TenantSettingsController {
  constructor(
    private readonly updateTenantSettings: UpdateTenantSettingsUseCase,
    private readonly tenantContext: RequestContext,
  ) {}

  @Patch('settings')
  @HttpCode(HttpStatus.OK)
  updateSettings(
    @Body(new ZodValidationPipe(UpdateTenantSettingsSchema)) dto: UpdateTenantSettingsDto,
  ): Promise<UpdateTenantSettingsUseCaseResult> {
    return this.updateTenantSettings
      .execute(this.tenantContext.tenantId, dto)
      .catch(mapPlatformError);
  }
}
