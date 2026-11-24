import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import type {
  BillingAccessResponse,
  BillingChargesResponse,
  BillingSummaryResponse,
} from '@ikaro/types';
import { CurrentUser, CurrentUserPayload } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { AppLogger } from '../../shared/observability/app-logger';
import {
  toBillingAccessResponse,
  toBillingChargesResponse,
  toBillingSummaryResponse,
} from './billing.mapper';
import {
  BackendBillingChargesSchema,
  BackendBillingSummarySchema,
  BillingChargesQuerySchema,
} from './billing.schemas';
import type { BillingChargesQuery } from './billing.types';
import { readTenantAccess } from './tenant-access.reader';

// The billing slice's authenticated routes. The tenant always comes from the JWT (the backend client
// forwards it), never from a parameter, and this layer adds no cache and no access check of its own:
// the backend owns entitlement and suspension (M25-S33).
@Controller('billing')
export class BillingController {
  private readonly logger = new AppLogger(BillingController.name);

  constructor(private readonly backendHttp: BackendHttpService) {}

  // The canonical read of operational state for the web (staff notice, customer badge, dashboard),
  // open to every authenticated role: no `@Roles`. The web reads this to learn that a tenant is
  // suspended (the suspended notice, the manager redirect), so it must answer for a suspended
  // tenant: no feature owns it, and every authenticated role may read it while suspended. The
  // backend port keeps the 300 s / 10 s cache.
  @Get('access')
  async getAccess(@CurrentUser() user: CurrentUserPayload): Promise<BillingAccessResponse> {
    const access = await readTenantAccess(this.backendHttp, user.tenantId, this.logger);
    return toBillingAccessResponse(user.role, access);
  }

  // The manager's billing page (UC-117). Manager-only; the backend route declares the suspension
  // policy that lets a suspended manager through, so this layer carries no annotation for it.
  @Get('summary')
  @Roles('MANAGER')
  async getSummary(): Promise<BillingSummaryResponse> {
    const raw = await this.backendHttp.get<unknown>('/billing/summary');
    return toBillingSummaryResponse(BackendBillingSummarySchema.parse(raw));
  }

  @Get('charges')
  @Roles('MANAGER')
  async getCharges(
    @Query(new ZodValidationPipe(BillingChargesQuerySchema)) query: BillingChargesQuery,
  ): Promise<BillingChargesResponse> {
    const raw = await this.backendHttp.get<unknown>('/billing/charges', {
      limit: query.limit,
      offset: query.offset,
    });
    return toBillingChargesResponse(BackendBillingChargesSchema.parse(raw));
  }
}
