import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CanonicalParseUUIDPipe,
  NoFeatureGate,
  SuspensionAccess,
  ZodValidationPipe,
} from '@ikaro/nestjs-http';
import {
  type BillingChargesQuery,
  BillingChargesQuerySchema,
  type BillingIdentityUpdateDto,
  BillingIdentityUpdateSchema,
  type PlanPreviewDto,
  PlanPreviewSchema,
} from '@ikaro/validation';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  GetBillingIdentityUseCase,
  GetBillingIdentityUseCaseResult,
} from '../../application/use-cases/get-billing-identity.use-case';
import {
  GetBillingSummaryUseCase,
  GetBillingSummaryUseCaseResult,
} from '../../application/use-cases/get-billing-summary.use-case';
import {
  GetOrRegenerateChargePaymentLinkUseCase,
  GetOrRegenerateChargePaymentLinkUseCaseResult,
} from '../../application/use-cases/get-or-regenerate-charge-payment-link.use-case';
import {
  GetPlanCatalogUseCase,
  GetPlanCatalogUseCaseResult,
} from '../../application/use-cases/get-plan-catalog.use-case';
import {
  ListBillingChargesUseCase,
  ListBillingChargesUseCaseResult,
} from '../../application/use-cases/list-billing-charges.use-case';
import {
  PreviewPlanSelectionUseCase,
  PreviewPlanSelectionUseCaseResult,
} from '../../application/use-cases/preview-plan-selection.use-case';
import {
  RecordPaymentReturnUseCase,
  RecordPaymentReturnUseCaseResult,
} from '../../application/use-cases/record-payment-return.use-case';
import {
  UpdateBillingIdentityUseCase,
  UpdateBillingIdentityUseCaseResult,
} from '../../application/use-cases/update-billing-identity.use-case';
import { mapBillingError } from '../http/billing-error.mapper';

// The manager's billing page (UC-117) and the way they pay (UC-119). The tenant is the caller's own,
// from `RequestContext` (never a parameter). No feature owns billing (`@NoFeatureGate()`), and a
// suspended manager must still reach it: it is the only page they can (`MANAGER_BILLING` admits
// `MANAGER` only, and the role guard repeats that at the route). The reads take no lock; the two
// payment routes lock one charge row inside their use cases.
@Controller('billing')
@NoFeatureGate()
@SuspensionAccess('MANAGER_BILLING')
@UseGuards(ManagerRoleGuard)
export class BillingController {
  constructor(
    private readonly getSummary: GetBillingSummaryUseCase,
    private readonly listCharges: ListBillingChargesUseCase,
    private readonly getPlanCatalog: GetPlanCatalogUseCase,
    private readonly previewPlanSelection: PreviewPlanSelectionUseCase,
    private readonly paymentLink: GetOrRegenerateChargePaymentLinkUseCase,
    private readonly paymentReturn: RecordPaymentReturnUseCase,
    private readonly getIdentity: GetBillingIdentityUseCase,
    private readonly updateIdentity: UpdateBillingIdentityUseCase,
    private readonly requestContext: RequestContext,
  ) {}

  @Get('summary')
  @HttpCode(HttpStatus.OK)
  summary(): Promise<GetBillingSummaryUseCaseResult> {
    return this.getSummary
      .execute({ tenantId: this.requestContext.tenantId })
      .catch(mapBillingError);
  }

  @Get('charges')
  @HttpCode(HttpStatus.OK)
  charges(
    @Query(new ZodValidationPipe(BillingChargesQuerySchema)) query: BillingChargesQuery,
  ): Promise<ListBillingChargesUseCaseResult> {
    return this.listCharges
      .execute({ tenantId: this.requestContext.tenantId, ...query })
      .catch(mapBillingError);
  }

  // The "Dados de cobrança" tab (UC-118, M26-S16). The save is a partial update under the account
  // row lock; it never calls the provider.
  @Get('identity')
  @HttpCode(HttpStatus.OK)
  identity(): Promise<GetBillingIdentityUseCaseResult> {
    return this.getIdentity
      .execute({ tenantId: this.requestContext.tenantId })
      .catch(mapBillingError);
  }

  @Put('identity')
  @HttpCode(HttpStatus.OK)
  saveIdentity(
    @Body(new ZodValidationPipe(BillingIdentityUpdateSchema)) body: BillingIdentityUpdateDto,
  ): Promise<UpdateBillingIdentityUseCaseResult> {
    return this.updateIdentity
      .execute({ ...body, tenantId: this.requestContext.tenantId })
      .catch(mapBillingError);
  }

  // The Plano tab (UC-136, M26-S17): read-only. The read-only states are reported in the answer,
  // never enforced here; the save (M26-S19) is where a read-only plan is refused.
  @Get('plan')
  @HttpCode(HttpStatus.OK)
  plan(): Promise<GetPlanCatalogUseCaseResult> {
    return this.getPlanCatalog
      .execute({ tenantId: this.requestContext.tenantId })
      .catch(mapBillingError);
  }

  // A preview saves nothing and does not run the BOOKING-removal guard (checked at save only).
  @Post('plan/preview')
  @HttpCode(HttpStatus.OK)
  previewPlan(
    @Body(new ZodValidationPipe(PlanPreviewSchema)) body: PlanPreviewDto,
  ): Promise<PreviewPlanSelectionUseCaseResult> {
    return this.previewPlanSelection
      .execute({ tenantId: this.requestContext.tenantId, items: body.items })
      .catch(mapBillingError);
  }

  // UC-119: the hosted payment URL of one of the tenant's own charges (a charge id of another
  // tenant is "not found"). The response is the one place a URL is returned.
  @Post('charges/:chargeId/payment-link')
  @HttpCode(HttpStatus.OK)
  getPaymentLink(
    @Param('chargeId', CanonicalParseUUIDPipe) chargeId: string,
  ): Promise<GetOrRegenerateChargePaymentLinkUseCaseResult> {
    return this.paymentLink
      .execute({ tenantId: this.requestContext.tenantId, chargeId })
      .catch(mapBillingError);
  }

  // UC-119 / UC-116: the manager is back from the hosted page. Never fails because the provider is
  // unreachable; the answer is the charge's current state.
  @Post('charges/:chargeId/payment-return')
  @HttpCode(HttpStatus.OK)
  recordPaymentReturn(
    @Param('chargeId', CanonicalParseUUIDPipe) chargeId: string,
  ): Promise<RecordPaymentReturnUseCaseResult> {
    return this.paymentReturn
      .execute({
        tenantId: this.requestContext.tenantId,
        chargeId,
        correlationId: this.requestContext.correlationId,
      })
      .catch(mapBillingError);
  }
}
