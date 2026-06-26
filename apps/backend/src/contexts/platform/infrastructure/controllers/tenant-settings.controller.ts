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
import { TenantSettings, TenantSettingsProps } from '../../domain/value-objects/tenant-settings.vo';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { mapPlatformError } from '../http/platform-error.mapper';

export interface GetTenantSettingsResult {
  tenantId: string;
  name: string;
  slug: string;
  settings: TenantSettingsProps;
}

export interface GetTenantFormattingResult {
  locale: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  timeFormat: '24h' | '12h';
  welcomeStaffScreenDays: number;
}

@Controller('tenants')
@UseGuards(ManagerRoleGuard)
export class TenantSettingsController {
  constructor(
    private readonly getTenantById: GetTenantByIdUseCase,
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
  async getFormatting(): Promise<GetTenantFormattingResult> {
    const tenant = await this.getTenantById
      .execute(this.tenantContext.tenantId)
      .catch(mapPlatformError);
    const settings = TenantSettings.reconstitute(tenant.settings);
    const resolved = settings.resolveLocalization();
    return {
      locale: resolved.language,
      currency: resolved.currency,
      timezone: tenant.settings.businessHours.timezone,
      dateFormat: resolved.dateFormat,
      timeFormat: resolved.timeFormat,
      welcomeStaffScreenDays: settings.booking.welcomeStaffScreenDays,
    };
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
