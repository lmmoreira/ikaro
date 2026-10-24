import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import type { ApplyHotsiteTemplateResponse, HotsiteTemplateSummaryResponse } from '@ikaro/types';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import {
  ApplyHotsiteTemplateBody,
  ApplyHotsiteTemplateBodySchema,
  HotsiteTemplateIdParamSchema,
} from './hotsite-templates.schemas';

/**
 * Manager-only view of the platform's hotsite template catalogue. Display names and descriptions
 * are the web's (keyed by template id in its locale files); this layer only relays the catalogue
 * and the pure apply operation, and forwards no tenant id: the backend derives it from the actor.
 */
@Controller('tenants/hotsite')
@Roles('MANAGER')
export class HotsiteTemplatesController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get('templates')
  async listTemplates(): Promise<HotsiteTemplateSummaryResponse[]> {
    const { templates } = await this.backendHttp.get<{
      templates: HotsiteTemplateSummaryResponse[];
    }>('/tenants/hotsite/templates');
    return templates;
  }

  @Post('templates/:templateId/apply')
  @HttpCode(HttpStatus.OK)
  applyTemplate(
    @Param('templateId', new ZodValidationPipe(HotsiteTemplateIdParamSchema)) templateId: string,
    @Body(new ZodValidationPipe(ApplyHotsiteTemplateBodySchema)) body: ApplyHotsiteTemplateBody,
  ): Promise<ApplyHotsiteTemplateResponse> {
    return this.backendHttp.post<ApplyHotsiteTemplateResponse>(
      `/tenants/hotsite/templates/${templateId}/apply`,
      body,
    );
  }
}
