import { Controller, Get, Param, Query } from '@nestjs/common';
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
} from './lead-form.schemas';

// Request Zod schema moved to lead-form.schemas.ts — re-exported here so any existing import
// of these symbols from this file keeps working unchanged (mirrors tenant-settings.controller.ts).
export * from './lead-form.schemas';

// Config writes go through PATCH /v1/tenants/hotsite (hotsite-admin.controller.ts) as of
// M20-S08 — audienceMode/questions are optional fields on that consolidated endpoint, not a
// separate PATCH here. This controller stays read-only for config (GET), and owns
// submissions/status, which have no equivalent on the hotsite endpoint.
@Controller('tenants/lead-form')
export class LeadFormController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get('config')
  @Roles('MANAGER')
  getConfig(): Promise<LeadFormConfigResponse> {
    return this.backendHttp.get<LeadFormConfigResponse>('/tenants/lead-form/config');
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
