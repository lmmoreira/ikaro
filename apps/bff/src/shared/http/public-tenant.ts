import { HttpStatus } from '@nestjs/common';
import { BffErrorCode } from '@ikaro/types';
import { BackendHttpService } from './backend-http.service';
import { throwProblemDetail } from './problem-detail';
import { TenantInfoResponse } from '../types/backend-responses';

export async function withPublicTenant<T>(
  backendHttp: BackendHttpService,
  tenantSlug: string | undefined,
  run: (tenantId: string) => Promise<T>,
): Promise<T> {
  if (!tenantSlug) {
    throwProblemDetail(
      HttpStatus.BAD_REQUEST,
      BffErrorCode.TENANT_SLUG_HEADER_REQUIRED,
      'X-Tenant-Slug header is required',
    );
  }

  const tenant = await backendHttp.get<TenantInfoResponse>(
    `/internal/tenants/by-slug/${encodeURIComponent(tenantSlug)}`,
  );
  return run(tenant.id);
}
