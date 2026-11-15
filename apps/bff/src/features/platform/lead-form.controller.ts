import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  LeadFormConfigResponse,
  LeadFormFilterOptionsResponse,
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
    // `filters` is a real array by the time the Zod pipe above has run (ListLeadFormSubmissionsSchema
    // parses the wire's JSON-string query param into it) — the backend applies the identical shared
    // schema and expects that same JSON-string shape back on its own wire, so it must be
    // re-serialized here rather than forwarded as the parsed object (axios would otherwise encode an
    // array param as bracket-notation query keys, not JSON, which the backend's z.string() step
    // would reject outright).
    const { filters, ...rest } = query;
    return this.backendHttp.get<LeadFormSubmissionsListResponse>('/tenants/lead-form/submissions', {
      ...rest,
      ...(filters !== undefined ? { filters: JSON.stringify(filters) } : {}),
    });
  }

  // Declared before `submissions/:id` — Nest matches routes in declaration order (same reasoning
  // as the backend's own lead-form.controller.ts).
  @Get('submissions/filter-options')
  @Roles('STAFF', 'MANAGER')
  getFilterOptions(): Promise<LeadFormFilterOptionsResponse> {
    return this.backendHttp.get<LeadFormFilterOptionsResponse>(
      '/tenants/lead-form/submissions/filter-options',
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
