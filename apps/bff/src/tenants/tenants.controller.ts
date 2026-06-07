import { Controller, Get, Header, Param } from '@nestjs/common';
import { Public } from '../shared/decorators/public.decorator';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { TenantInfoResponse } from '../shared/types/backend-responses';
import { HotsiteManifestResponse, HotsiteResponse } from './tenants.types';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get('slug/:slug')
  @Public()
  @Header('Cache-Control', 'public, max-age=300')
  async getManifest(@Param('slug') slug: string): Promise<HotsiteManifestResponse> {
    const tenant = await this.backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/by-slug/${slug}`,
    );
    const hotsite = await this.backendHttp.getForPublic<HotsiteResponse>('/hotsite', tenant.id);
    return { tenant, ...hotsite };
  }
}
