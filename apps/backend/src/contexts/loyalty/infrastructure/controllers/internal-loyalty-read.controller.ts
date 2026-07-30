import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { GenericErrorCode } from '@ikaro/types';
import { parseCommaSeparatedIds } from '../../../../shared/utils/parse-comma-separated-ids';
import {
  GetLoyaltyBalancesBatchUseCase,
  LoyaltyBalanceBatchItemResult,
} from '../../application/use-cases/get-loyalty-balances-batch/get-loyalty-balances-batch.use-case';
import { mapLoyaltyError } from '../http/loyalty-error.mapper';

@Controller('internal/loyalty')
export class InternalLoyaltyReadController {
  constructor(private readonly getLoyaltyBalancesBatch: GetLoyaltyBalancesBatchUseCase) {}

  // Batch lookup — used by the BFF to resolve loyalty balances for many customers in one
  // call (avoids the N+1 fan-out one-call-per-customer would otherwise require). Internal
  // routes skip the RequestInterceptor (no ambient X-Tenant-ID), so tenantId is an explicit
  // query param here, not read from RequestContext.
  @Get('balances')
  async getBalancesRoute(
    @Query('tenantId') tenantId: string | string[] | undefined,
    @Query('customerIds') customerIds: string | string[] | undefined,
  ): Promise<LoyaltyBalanceBatchItemResult[]> {
    if (typeof tenantId !== 'string' || !tenantId.trim()) {
      throw throwProblemDetail(
        HttpStatus.BAD_REQUEST,
        GenericErrorCode.FIELD_REQUIRED,
        'tenantId query parameter is required',
        'tenantId',
      );
    }
    if (typeof customerIds !== 'string' || !customerIds.trim()) {
      throw throwProblemDetail(
        HttpStatus.BAD_REQUEST,
        GenericErrorCode.FIELD_REQUIRED,
        'customerIds query parameter is required',
        'customerIds',
      );
    }
    const ids = parseCommaSeparatedIds(customerIds);
    if (ids.length === 0) {
      throw throwProblemDetail(
        HttpStatus.BAD_REQUEST,
        GenericErrorCode.FIELD_REQUIRED,
        'customerIds query parameter is required',
        'customerIds',
      );
    }

    return this.getLoyaltyBalancesBatch
      .execute({ tenantId, customerIds: ids })
      .then((result) => result.items)
      .catch(mapLoyaltyError);
  }
}
