import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Query } from '@nestjs/common';
import {
  LeadFormConfigResponse,
  LeadFormStatusResponse,
  LeadFormSubmissionDetailResponse,
  LeadFormSubmissionsListResponse,
} from '@ikaro/types';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import {
  ListLeadFormSubmissionsQuery,
  ListLeadFormSubmissionsQuerySchema,
  UpdateLeadFormConfigBody,
  UpdateLeadFormConfigBodySchema,
} from './lead-form.schemas';

// Request Zod schema moved to lead-form.schemas.ts — re-exported here so any existing import
// of these symbols from this file keeps working unchanged (mirrors tenant-settings.controller.ts).
export * from './lead-form.schemas';

@Controller('tenants/lead-form')
export class LeadFormController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get('config')
  @Roles('MANAGER')
  getConfig(): Promise<LeadFormConfigResponse> {
    return this.backendHttp.get<LeadFormConfigResponse>('/tenants/lead-form/config');
  }

  @Patch('config')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER')
  updateConfig(
    @Body(new ZodValidationPipe(UpdateLeadFormConfigBodySchema)) body: UpdateLeadFormConfigBody,
  ): Promise<LeadFormConfigResponse> {
    return this.backendHttp.patch<LeadFormConfigResponse>('/tenants/lead-form/config', body);
  }

  @Get('status')
  @Roles('STAFF', 'MANAGER')
  getStatus(): Promise<LeadFormStatusResponse> {
    return this.backendHttp.get<LeadFormStatusResponse>('/tenants/lead-form/status');
  }

  @Get('submissions')
  @Roles('STAFF', 'MANAGER')
  listSubmissions(
    @Query(new ZodValidationPipe(ListLeadFormSubmissionsQuerySchema))
    query: ListLeadFormSubmissionsQuery,
  ): Promise<LeadFormSubmissionsListResponse> {
    return this.backendHttp.get<LeadFormSubmissionsListResponse>(
      '/tenants/lead-form/submissions',
      query,
    );
  }

  @Get('submissions/:id')
  @Roles('STAFF', 'MANAGER')
  getSubmission(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<LeadFormSubmissionDetailResponse> {
    return this.backendHttp.get<LeadFormSubmissionDetailResponse>(
      `/tenants/lead-form/submissions/${id}`,
    );
  }
}
