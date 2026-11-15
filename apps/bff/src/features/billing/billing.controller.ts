import { Controller, Get } from '@nestjs/common';
import type { BillingAccessResponse } from '@ikaro/types';
import { CurrentUser, CurrentUserPayload } from '../../shared/decorators/current-user.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { AppLogger } from '../../shared/observability/app-logger';
import { toBillingAccessResponse } from './billing.mapper';
import { readTenantAccess } from './tenant-access.reader';

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
  async getAccess(@CurrentUser() user: CurrentUserPayload): Promise<BillingAccessResponse> {
    const access = await readTenantAccess(this.backendHttp, user.tenantId, this.logger);
    return toBillingAccessResponse(user.role, access);
  }
}
