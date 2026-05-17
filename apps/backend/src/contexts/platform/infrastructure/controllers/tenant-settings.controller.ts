import { Body, Controller, HttpCode, HttpStatus, Patch, UseGuards, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import {
  UpdateTenantSettingsDto,
  UpdateTenantSettingsSchema,
} from '../../application/dtos/update-tenant-settings.dto';
import {
  UpdateTenantSettingsResult,
  UpdateTenantSettingsUseCase,
} from '../../application/use-cases/update-tenant-settings.use-case';
import { ManagerRoleGuard } from '../guards/manager-role.guard';
import { mapPlatformError } from '../http/platform-error.mapper';

@Controller('tenants')
@UseGuards(ManagerRoleGuard)
export class TenantSettingsController {
  constructor(
    private readonly updateTenantSettings: UpdateTenantSettingsUseCase,
    private readonly tenantContext: TenantContext,
  ) {}

  @Patch('settings')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(UpdateTenantSettingsSchema))
  updateSettings(@Body() dto: UpdateTenantSettingsDto): Promise<UpdateTenantSettingsResult> {
    return this.updateTenantSettings
      .execute(this.tenantContext.tenantId, dto)
      .catch(mapPlatformError);
  }
}
