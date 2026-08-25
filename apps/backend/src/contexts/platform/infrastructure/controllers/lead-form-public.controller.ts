import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  SubmitLeadFormDto,
  SubmitLeadFormSchema,
} from '../../application/dtos/submit-lead-form.dto';
import {
  GetLeadFormPublicConfigUseCase,
  GetLeadFormPublicConfigUseCaseResult,
} from '../../application/use-cases/get-lead-form-public-config.use-case';
import {
  SubmitLeadFormUseCase,
  SubmitLeadFormUseCaseResult,
} from '../../application/use-cases/submit-lead-form.use-case';
import { mapPlatformError } from '../http/platform-error.mapper';

// Bare route, no `/public/` prefix — that convention is BFF-only (`.public.controller.ts`).
// Guest-reachable the same way ChatbotController already is: tenantId comes from RequestContext
// (populated per-request from the BFF's X-Tenant-ID header regardless of whether an actor
// exists), not from a route guard. Public counterpart to LeadFormController (`tenants/lead-form`,
// MANAGER-only) — never returns the teaser/admin fields that controller does.
@Controller('platform/lead-form')
export class LeadFormPublicController {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly getLeadFormPublicConfig: GetLeadFormPublicConfigUseCase,
    private readonly submitLeadForm: SubmitLeadFormUseCase,
  ) {}

  @Get('config')
  @HttpCode(HttpStatus.OK)
  getConfig(): Promise<GetLeadFormPublicConfigUseCaseResult> {
    return this.getLeadFormPublicConfig
      .execute({ tenantId: this.requestContext.tenantId })
      .catch(mapPlatformError);
  }

  @Post('submissions')
  @HttpCode(HttpStatus.OK)
  submit(
    @Body(new ZodValidationPipe(SubmitLeadFormSchema)) body: SubmitLeadFormDto,
  ): Promise<SubmitLeadFormUseCaseResult> {
    const { tenantId, correlationId } = this.requestContext;
    return this.submitLeadForm
      .execute({ tenantId, correlationId, ...body })
      .catch(mapPlatformError);
  }
}
