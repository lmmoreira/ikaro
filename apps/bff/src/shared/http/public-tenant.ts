import { HttpException, HttpStatus } from '@nestjs/common';
import { BackendHttpService } from './backend-http.service';
import { TenantInfoResponse } from '../types/backend-responses';

export async function withPublicTenant<T>(
  backendHttp: BackendHttpService,
  tenantSlug: string | undefined,
  run: (tenantId: string) => Promise<T>,
): Promise<T> {
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

  const tenant = await backendHttp.get<TenantInfoResponse>(
    `/internal/tenants/by-slug/${tenantSlug}`,
  );
  return run(tenant.id);
}
