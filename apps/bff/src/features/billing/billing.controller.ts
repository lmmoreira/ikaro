import { Controller, Get, HttpException } from '@nestjs/common';
import type { BillingAccessResponse } from '@ikaro/types';
import { FEATURE_KEYS } from '@ikaro/validation';
import { CurrentUser, CurrentUserPayload } from '../../shared/decorators/current-user.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { BackendTenantAccessSchema } from './billing.schemas';
import { toBillingAccessResponse } from './billing.mapper';
import type { BackendTenantAccess } from './billing.types';

// The canonical read of operational state for the web (staff notice, customer badge, dashboard).
// Open to every authenticated role: no `@Roles`, and the tenant comes from the JWT, never from a
// parameter. It adds no cache of its own: the backend port keeps the 60 s / 10 s cache.
@Controller('billing')
export class BillingController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get('access')
  async getAccess(@CurrentUser() user: CurrentUserPayload): Promise<BillingAccessResponse> {
    const access = await this.readAccess(user.tenantId);
    return toBillingAccessResponse(user.role, access);
  }

  // Fails open on a lookup error (UC-120 A2): a backend outage must not lock a paying tenant out.
  // A 4xx is a real answer (an unknown tenant, a bad key) and is never swallowed.
  private async readAccess(tenantId: string): Promise<BackendTenantAccess> {
    try {
      const raw = await this.backendHttp.get<unknown>(
        `/internal/billing/tenants/${tenantId}/access`,
      );
      return BackendTenantAccessSchema.parse(raw);
    } catch (err: unknown) {
      if (err instanceof HttpException && err.getStatus() < 500) throw err;
      return failOpenAccess();
    }
  }
}

function failOpenAccess(): BackendTenantAccess {
  return {
    status: 'ACTIVE',
    operational: true,
    features: FEATURE_KEYS.map((key) => ({ key, tier: key === 'CHATBOT' ? 'BASIC' : 'STANDARD' })),
  };
}
