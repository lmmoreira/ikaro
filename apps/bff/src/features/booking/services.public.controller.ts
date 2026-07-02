import { Controller, Get, Headers } from '@nestjs/common';
import { HotsiteServiceListResponse } from '@ikaro/types';
import { Public } from '../../shared/decorators/public.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { withPublicTenant } from '../../shared/http/public-tenant';

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
}
