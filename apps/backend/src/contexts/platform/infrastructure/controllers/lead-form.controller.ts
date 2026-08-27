import { Controller, Get, HttpCode, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import {
  ListLeadFormSubmissionsDto,
  ListLeadFormSubmissionsSchema,
} from '../../application/dtos/list-lead-form-submissions.dto';
import {
  GetLeadFormConfigUseCase,
  GetLeadFormConfigUseCaseResult,
} from '../../application/use-cases/get-lead-form-config.use-case';
import {
  GetLeadFormFilterOptionsUseCase,
  GetLeadFormFilterOptionsUseCaseResult,
} from '../../application/use-cases/get-lead-form-filter-options.use-case';
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
import { mapPlatformError } from '../http/platform-error.mapper';

// Config writes go through PATCH /v1/tenants/hotsite (UpdateHotsiteContentUseCase) as of
// M20-S08 — audienceMode/questions are optional fields on that consolidated endpoint, not a
// separate PATCH here. This controller stays read-only for config (GET), and owns
// submissions/status, which have no equivalent on the hotsite endpoint.
@Controller('tenants/lead-form')
export class LeadFormController {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly getLeadFormConfig: GetLeadFormConfigUseCase,
    private readonly getLeadFormStatus: GetLeadFormStatusUseCase,
    private readonly listLeadFormSubmissions: ListLeadFormSubmissionsUseCase,
    private readonly getLeadFormSubmission: GetLeadFormSubmissionUseCase,
    private readonly getLeadFormFilterOptions: GetLeadFormFilterOptionsUseCase,
  ) {}

  @Get('config')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ManagerRoleGuard)
  getConfig(): Promise<GetLeadFormConfigUseCaseResult> {
    return this.getLeadFormConfig
      .execute({ tenantId: this.requestContext.tenantId })
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

  // Declared before `submissions/:id` — Nest/Express match routes in declaration order, so a
  // literal path after a `:id` param route would be captured as `id === 'filter-options'`.
  @Get('submissions/filter-options')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  getFilterOptions(): Promise<GetLeadFormFilterOptionsUseCaseResult> {
    return this.getLeadFormFilterOptions
      .execute({ tenantId: this.requestContext.tenantId })
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
