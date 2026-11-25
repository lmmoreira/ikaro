import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { NoFeatureGate, SuspensionAccess, ZodValidationPipe } from '@ikaro/nestjs-http';
import {
  ProvisionTenantDto,
  ProvisionTenantSchema,
} from '../../application/dtos/provision-tenant.dto';
import {
  ProvisionTenantUseCaseInput,
  ProvisionTenantUseCaseResult,
  ProvisionTenantUseCase,
} from '../../application/use-cases/provision-tenant.use-case';
import { PlatformAdminGuard } from '../../../../shared/guards/platform-admin.guard';
import { mapPlatformError } from '../http/platform-error.mapper';

@NoFeatureGate()
@SuspensionAccess('ANY_AUTHENTICATED')
@Controller('internal/tenants')
@UseGuards(PlatformAdminGuard)
export class InternalTenantController {
  constructor(private readonly provisionTenant: ProvisionTenantUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  provision(
    @Body(new ZodValidationPipe(ProvisionTenantSchema)) dto: ProvisionTenantDto,
  ): Promise<ProvisionTenantUseCaseResult> {
    const input: ProvisionTenantUseCaseInput = {
      name: dto.name,
      slug: dto.slug,
      adminEmail: dto.adminEmail,
      country_code: dto.country_code,
      timezone: dto.timezone,
      registrationId: dto.registrationId,
      // The operator path may provision Ikaro's own tenant; self-signup never does (UC-024, UC-128).
      allowOwnerSlug: true,
    };
    return this.provisionTenant.execute(input).catch(mapPlatformError);
  }
}
