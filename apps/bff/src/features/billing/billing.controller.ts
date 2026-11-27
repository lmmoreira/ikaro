import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import type {
  BillingAccessResponse,
  BillingChargesResponse,
  BillingPaymentLinkResponse,
  BillingPaymentReturnResponse,
  BillingPlanPreviewResponse,
  BillingPlanResponse,
  BillingSummaryResponse,
} from '@ikaro/types';
import {
  type BillingChargesQuery,
  BillingChargesQuerySchema,
  type PlanPreviewDto,
  PlanPreviewSchema,
} from '@ikaro/validation';
import { CurrentUser, CurrentUserPayload } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { AppLogger } from '../../shared/observability/app-logger';
import {
  toBillingAccessResponse,
  toBillingChargesResponse,
  toBillingPlanPreviewResponse,
  toBillingPlanResponse,
  toBillingSummaryResponse,
} from './billing.mapper';
import {
  toBillingPaymentLinkResponse,
  toBillingPaymentReturnResponse,
} from './billing-payment.mapper';
import {
  BackendBillingChargesSchema,
  BackendBillingPaymentLinkSchema,
  BackendBillingPaymentReturnSchema,
  BackendBillingPlanPreviewSchema,
  BackendBillingPlanSchema,
  BackendBillingSummarySchema,
} from './billing.schemas';
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

  // The Plano tab (UC-136, M26-S17). Manager-only; the backend owns read-only and suspension.
  @Get('plan')
  @Roles('MANAGER')
  async getPlan(): Promise<BillingPlanResponse> {
    const raw = await this.backendHttp.get<unknown>('/billing/plan');
    return toBillingPlanResponse(BackendBillingPlanSchema.parse(raw));
  }

  // Nothing is saved: a preview of the proposed final selection and the plan it would cost.
  @Post('plan/preview')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER')
  async previewPlan(
    @Body(new ZodValidationPipe(PlanPreviewSchema)) body: PlanPreviewDto,
  ): Promise<BillingPlanPreviewResponse> {
    const raw = await this.backendHttp.post<unknown>('/billing/plan/preview', {
      items: body.items,
    });
    return toBillingPlanPreviewResponse(BackendBillingPlanPreviewSchema.parse(raw));
  }

  // UC-119: the one route that returns a provider URL. The backend owns "is it payable" and
  // "is the tenant suspended" (the manager of a suspended tenant still reaches it); this layer
  // forwards its typed errors and adds no check of its own.
  @Post('charges/:chargeId/payment-link')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER')
  async getPaymentLink(
    @Param('chargeId', CanonicalParseUUIDPipe) chargeId: string,
  ): Promise<BillingPaymentLinkResponse> {
    const raw = await this.backendHttp.post<unknown>(
      `/billing/charges/${chargeId}/payment-link`,
      {},
    );
    return toBillingPaymentLinkResponse(BackendBillingPaymentLinkSchema.parse(raw));
  }

  // UC-119 / UC-116: called when the manager returns from the hosted page. The backend never fails
  // it because the provider is unreachable, so neither does this.
  @Post('charges/:chargeId/payment-return')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER')
  async recordPaymentReturn(
    @Param('chargeId', CanonicalParseUUIDPipe) chargeId: string,
  ): Promise<BillingPaymentReturnResponse> {
    const raw = await this.backendHttp.post<unknown>(
      `/billing/charges/${chargeId}/payment-return`,
      {},
    );
    return toBillingPaymentReturnResponse(BackendBillingPaymentReturnSchema.parse(raw));
  }
}
