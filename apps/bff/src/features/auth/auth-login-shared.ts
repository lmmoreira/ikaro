import { HttpException, HttpStatus } from '@nestjs/common';
import { AppLogger } from '../../shared/observability/app-logger';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { TenantInfoResponse } from '../../shared/types/backend-responses';

// Shared by auth-staff-login.flow.ts and auth-tenant-login.flow.ts — split out of
// auth-controller-flow.service.ts to keep it under the file-length cap, and to keep each
// Google-callback flow in its own file.
export const authLoginLogger = new AppLogger('AuthControllerFlowService');

export async function findTenantBySlug(
  backendHttp: BackendHttpService,
  tenantSlug: string,
): Promise<TenantInfoResponse | null> {
  return backendHttp
    .get<TenantInfoResponse>(`/internal/tenants/by-slug/${tenantSlug}`)
    .catch((err: unknown) => {
      if (err instanceof HttpException && err.getStatus() === HttpStatus.NOT_FOUND) return null;
      throw err;
    });
}
