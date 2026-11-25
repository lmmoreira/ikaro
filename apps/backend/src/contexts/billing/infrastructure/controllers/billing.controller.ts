import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NoFeatureGate, SuspensionAccess, ZodValidationPipe } from '@ikaro/nestjs-http';
import {
  type BillingChargesQuery,
  BillingChargesQuerySchema,
  type PlanPreviewDto,
  PlanPreviewSchema,
} from '@ikaro/validation';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  GetBillingSummaryUseCase,
  GetBillingSummaryUseCaseResult,
} from '../../application/use-cases/get-billing-summary.use-case';
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
import { mapBillingError } from '../http/billing-error.mapper';

// The manager's billing page reads (UC-117). The tenant is the caller's own, from `RequestContext`
// (never a parameter). No feature owns billing (`@NoFeatureGate()`), and a suspended manager must
// still reach it: it is the only page they can (`MANAGER_BILLING` admits `MANAGER` only, and the
// role guard repeats that at the route). Read-only, so no lock and no transaction.
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
}
