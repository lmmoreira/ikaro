import { Controller, Get, Headers, Param } from '@nestjs/common';
import { HotsiteServiceListResponse, PublicServiceIntakeSchemaResponse } from '@ikaro/types';
import { CanonicalParseUUIDPipe } from '@ikaro/nestjs-http';
import { Public } from '../../shared/decorators/public.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { withPublicTenant } from '../../shared/http/public-tenant';
import { GetPublicServiceIntakeSchemaResult } from './services.types';
import { toPublicServiceIntakeSchemaResponse } from './services.mapper';

@Controller('public/services')
export class ServicesPublicController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  @Public()
  async list(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
  ): Promise<HotsiteServiceListResponse> {
    return withPublicTenant(this.backendHttp, tenantSlug, (tenantId) =>
      this.backendHttp.getForPublic<HotsiteServiceListResponse>('/services', tenantId),
    );
  }

  // UC-068 step 1 (M23-S02) — active version only, never history (a customer has no reason to
  // see prior form versions; the staff-facing equivalent lives on the authenticated
  // services.controller.ts, backed by a different backend path).
  @Get(':id/intake-schema')
  @Public()
  async getIntakeSchema(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<PublicServiceIntakeSchemaResponse> {
    return withPublicTenant(this.backendHttp, tenantSlug, async (tenantId) => {
      const result = await this.backendHttp.getForPublic<GetPublicServiceIntakeSchemaResult>(
        `/services/${id}/intake-schema/public`,
        tenantId,
      );
      return toPublicServiceIntakeSchemaResponse(result);
    });
  }
}
