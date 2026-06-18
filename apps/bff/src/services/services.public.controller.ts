import { Controller, Get, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { HotsiteServiceListResponse } from '@ikaro/types';
import { Public } from '../shared/decorators/public.decorator';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { TenantInfoResponse } from '../shared/types/backend-responses';

@Controller('services')
export class ServicesPublicController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  @Public()
  async list(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
  ): Promise<HotsiteServiceListResponse> {
    if (!tenantSlug) {
      throw new HttpException(
        {
          type: 'about:blank',
          title: 'Bad Request',
          status: HttpStatus.BAD_REQUEST,
          detail: 'X-Tenant-Slug header is required',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const tenant = await this.backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/by-slug/${tenantSlug}`,
    );
    return this.backendHttp.getForPublic<HotsiteServiceListResponse>('/services', tenant.id);
  }
}
