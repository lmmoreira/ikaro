import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import {
  UpdateLeadFormConfigDto,
  UpdateLeadFormConfigSchema,
} from '../../application/dtos/update-lead-form-config.dto';
import {
  ListLeadFormSubmissionsDto,
  ListLeadFormSubmissionsSchema,
} from '../../application/dtos/list-lead-form-submissions.dto';
import {
  GetLeadFormConfigUseCase,
  GetLeadFormConfigUseCaseResult,
} from '../../application/use-cases/get-lead-form-config.use-case';
import {
  GetLeadFormStatusUseCase,
  GetLeadFormStatusUseCaseResult,
} from '../../application/use-cases/get-lead-form-status.use-case';
import {
  GetLeadFormSubmissionUseCase,
  GetLeadFormSubmissionUseCaseResult,
} from '../../application/use-cases/get-lead-form-submission.use-case';
import {
  ListLeadFormSubmissionsUseCase,
  ListLeadFormSubmissionsUseCaseResult,
} from '../../application/use-cases/list-lead-form-submissions.use-case';
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
    private readonly listLeadFormSubmissions: ListLeadFormSubmissionsUseCase,
    private readonly getLeadFormSubmission: GetLeadFormSubmissionUseCase,
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

  @Get('submissions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  listSubmissions(
    @Query(new ZodValidationPipe(ListLeadFormSubmissionsSchema))
    query: ListLeadFormSubmissionsDto,
  ): Promise<ListLeadFormSubmissionsUseCaseResult> {
    return this.listLeadFormSubmissions
      .execute({ tenantId: this.requestContext.tenantId, ...query })
      .catch(mapPlatformError);
  }

  @Get('submissions/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  getSubmission(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<GetLeadFormSubmissionUseCaseResult> {
    return this.getLeadFormSubmission
      .execute({ tenantId: this.requestContext.tenantId, submissionId: id })
      .catch(mapPlatformError);
  }
}
