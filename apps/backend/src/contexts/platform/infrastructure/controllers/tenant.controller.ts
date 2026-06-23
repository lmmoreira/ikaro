import { Body, Controller, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { RequestContext } from '../../../../shared/request/request-context';
import { RenameTenantDto, RenameTenantSchema } from '../../application/dtos/rename-tenant.dto';
import {
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
    return this.renameTenant.execute(this.tenantContext.tenantId, dto).catch(mapPlatformError);
  }
}
