import { Body, Controller, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import {
  UpdateLeadFormConfigDto,
  UpdateLeadFormConfigSchema,
} from '../../application/dtos/update-lead-form-config.dto';
import {
  GetLeadFormConfigUseCase,
  GetLeadFormConfigUseCaseResult,
} from '../../application/use-cases/get-lead-form-config.use-case';
import {
  GetLeadFormStatusUseCase,
  GetLeadFormStatusUseCaseResult,
} from '../../application/use-cases/get-lead-form-status.use-case';
import {
  UpdateLeadFormModuleUseCase,
  UpdateLeadFormModuleUseCaseResult,
} from '../../application/use-cases/update-lead-form-module.use-case';
import { mapPlatformError } from '../http/platform-error.mapper';

@Controller('tenants/lead-form')
export class LeadFormController {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly getLeadFormConfig: GetLeadFormConfigUseCase,
    private readonly updateLeadFormModule: UpdateLeadFormModuleUseCase,
    private readonly getLeadFormStatus: GetLeadFormStatusUseCase,
  ) {}

  @Get('config')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ManagerRoleGuard)
  getConfig(): Promise<GetLeadFormConfigUseCaseResult> {
    return this.getLeadFormConfig
      .execute({ tenantId: this.requestContext.tenantId })
      .catch(mapPlatformError);
  }

  @Patch('config')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ManagerRoleGuard)
  updateConfig(
    @Body(new ZodValidationPipe(UpdateLeadFormConfigSchema)) body: UpdateLeadFormConfigDto,
  ): Promise<UpdateLeadFormModuleUseCaseResult> {
    return this.updateLeadFormModule
      .execute({ tenantId: this.requestContext.tenantId, ...body })
      .catch(mapPlatformError);
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  getStatus(): Promise<GetLeadFormStatusUseCaseResult> {
    return this.getLeadFormStatus
      .execute({ tenantId: this.requestContext.tenantId })
      .catch(mapPlatformError);
  }
}
