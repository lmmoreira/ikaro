import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import {
  ProvisionTenantDto,
  ProvisionTenantSchema,
} from '../../application/dtos/provision-tenant.dto';
import {
  ProvisionTenantUseCaseInput,
  ProvisionTenantUseCaseResult,
  ProvisionTenantUseCase,
} from '../../application/use-cases/provision-tenant.use-case';
import { PlatformAdminGuard } from '../guards/platform-admin.guard';
import { mapPlatformError } from '../http/platform-error.mapper';

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
    };
    return this.provisionTenant.execute(input).catch(mapPlatformError);
  }
}
