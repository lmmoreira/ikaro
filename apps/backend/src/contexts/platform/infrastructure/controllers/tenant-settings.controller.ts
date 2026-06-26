import { Body, Controller, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
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
import { GetTenantByIdUseCase } from '../../application/use-cases/get-tenant-by-id.use-case';
import {
  GetTenantFormattingUseCase,
  GetTenantFormattingUseCaseResult,
} from '../../application/use-cases/get-tenant-formatting.use-case';
import {
  GetTenantBookingConfigUseCase,
  GetTenantBookingConfigUseCaseResult,
} from '../../application/use-cases/get-tenant-booking-config.use-case';
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
@UseGuards(ManagerRoleGuard)
export class TenantSettingsController {
  constructor(
    private readonly getTenantById: GetTenantByIdUseCase,
    private readonly getTenantFormatting: GetTenantFormattingUseCase,
    private readonly getTenantBookingConfig: GetTenantBookingConfigUseCase,
    private readonly updateTenantSettings: UpdateTenantSettingsUseCase,
    private readonly tenantContext: RequestContext,
  ) {}

  @Get('settings')
  @HttpCode(HttpStatus.OK)
  async getSettings(): Promise<GetTenantSettingsResult> {
    const tenant = await this.getTenantById
      .execute(this.tenantContext.tenantId)
      .catch(mapPlatformError);
    return { tenantId: tenant.id, name: tenant.name, slug: tenant.slug, settings: tenant.settings };
  }

  @Get('formatting')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  getFormatting(): Promise<GetTenantFormattingUseCaseResult> {
    return this.getTenantFormatting.execute(this.tenantContext.tenantId).catch(mapPlatformError);
  }

  @Get('booking-config')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  getBookingConfig(): Promise<GetTenantBookingConfigUseCaseResult> {
    return this.getTenantBookingConfig.execute(this.tenantContext.tenantId).catch(mapPlatformError);
  }

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
