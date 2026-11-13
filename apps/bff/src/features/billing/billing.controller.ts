import { Controller, Get } from '@nestjs/common';
import type { BillingAccessResponse } from '@ikaro/types';
import { CurrentUser, CurrentUserPayload } from '../../shared/decorators/current-user.decorator';
import { NoFeatureGate } from '../../shared/decorators/no-feature-gate.decorator';
import { SuspensionAccess } from '../../shared/decorators/suspension-access.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { AppLogger } from '../../shared/observability/app-logger';
import { BackendTenantAccessSchema } from './billing.schemas';
import { recoverAccessLookup, toBillingAccessResponse } from './billing.mapper';
import type { BackendTenantAccess } from './billing.types';

// The canonical read of operational state for the web (staff notice, customer badge, dashboard).
// Open to every authenticated role: no `@Roles`, and the tenant comes from the JWT, never from a
// parameter. It adds no cache of its own: the backend port keeps the 300 s / 10 s cache.
@Controller('billing')
export class BillingController {
  private readonly logger = new AppLogger(BillingController.name);

  constructor(private readonly backendHttp: BackendHttpService) {}

  // The web reads this to learn that a tenant is suspended (the suspended notice, the manager
  // redirect), so it must answer for a suspended tenant: no feature owns it, and every
  // authenticated role may read it while suspended.
  @Get('access')
  @NoFeatureGate()
  @SuspensionAccess('ANY_AUTHENTICATED')
  async getAccess(@CurrentUser() user: CurrentUserPayload): Promise<BillingAccessResponse> {
    const access = await this.readAccess(user.tenantId);
    return toBillingAccessResponse(user.role, access);
  }

  // Fails open on a lookup error (UC-120 A2), through the mapper's `.catch`: a 4xx still propagates.
  private readAccess(tenantId: string): Promise<BackendTenantAccess> {
    return this.backendHttp
      .get<unknown>(`/internal/billing/tenants/${tenantId}/access`)
      .then((raw) => BackendTenantAccessSchema.parse(raw))
      .catch((err: unknown) => recoverAccessLookup(err, tenantId, this.logger));
  }
}
