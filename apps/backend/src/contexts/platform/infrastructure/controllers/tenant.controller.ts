import { Body, Controller, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import { RenameTenantDto, RenameTenantSchema } from '../../application/dtos/rename-tenant.dto';
import {
  RenameTenantUseCaseInput,
  RenameTenantUseCaseResult,
  RenameTenantUseCase,
} from '../../application/use-cases/rename-tenant.use-case';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { mapPlatformError } from '../http/platform-error.mapper';

@Controller('tenants')
@UseGuards(ManagerRoleGuard)
export class TenantController {
  constructor(
    private readonly renameTenant: RenameTenantUseCase,
    private readonly tenantContext: RequestContext,
  ) {}

  @Patch()
  @HttpCode(HttpStatus.OK)
  rename(
    @Body(new ZodValidationPipe(RenameTenantSchema)) dto: RenameTenantDto,
  ): Promise<RenameTenantUseCaseResult> {
    const input: RenameTenantUseCaseInput = {
      tenantId: this.tenantContext.tenantId,
      name: dto.name,
    };
    return this.renameTenant.execute(input).catch(mapPlatformError);
  }
}
