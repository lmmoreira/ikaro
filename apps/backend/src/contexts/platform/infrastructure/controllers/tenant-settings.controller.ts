import { Body, Controller, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  UpdateTenantSettingsDto,
  UpdateTenantSettingsSchema,
} from '../../application/dtos/update-tenant-settings.dto';
import {
  UpdateTenantSettingsUseCaseInput,
  UpdateTenantSettingsUseCaseResult,
  UpdateTenantSettingsUseCase,
} from '../../application/use-cases/update-tenant-settings.use-case';
import { GetTenantByIdUseCase } from '../../application/use-cases/get-tenant-by-id.use-case';
import { TenantSettingsProps } from '../../domain/value-objects/tenant-settings.vo';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { mapPlatformError } from '../http/platform-error.mapper';

export interface GetTenantSettingsResult {
  tenantId: string;
  name: string;
  slug: string;
  settings: TenantSettingsProps;
}

@Controller('tenants')
export class TenantSettingsController {
  constructor(
    private readonly getTenantById: GetTenantByIdUseCase,
    private readonly updateTenantSettings: UpdateTenantSettingsUseCase,
    private readonly tenantContext: RequestContext,
  ) {}

  @Get('settings')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  async getSettings(): Promise<GetTenantSettingsResult> {
    const tenant = await this.getTenantById
      .execute({ tenantId: this.tenantContext.tenantId })
      .catch(mapPlatformError);
    return { tenantId: tenant.id, name: tenant.name, slug: tenant.slug, settings: tenant.settings };
  }

  @Patch('settings')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ManagerRoleGuard)
  updateSettings(
    @Body(new ZodValidationPipe(UpdateTenantSettingsSchema)) dto: UpdateTenantSettingsDto,
  ): Promise<UpdateTenantSettingsUseCaseResult> {
    const input: UpdateTenantSettingsUseCaseInput = {
      tenantId: this.tenantContext.tenantId,
      settings: dto.settings as UpdateTenantSettingsUseCaseInput['settings'],
    };
    return this.updateTenantSettings.execute(input).catch(mapPlatformError);
  }
}
