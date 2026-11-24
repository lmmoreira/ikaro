import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { NoFeatureGate, SuspensionAccess, ZodValidationPipe } from '@ikaro/nestjs-http';
import { type BillingChargesQuery, BillingChargesQuerySchema } from '@ikaro/validation';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  GetBillingSummaryUseCase,
  GetBillingSummaryUseCaseResult,
} from '../../application/use-cases/get-billing-summary.use-case';
import {
  ListBillingChargesUseCase,
  ListBillingChargesUseCaseResult,
} from '../../application/use-cases/list-billing-charges.use-case';
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
}
