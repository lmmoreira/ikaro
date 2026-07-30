import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { GenericErrorCode } from '@ikaro/types';
import {
  GetLoyaltyBalancesBatchUseCase,
  LoyaltyBalanceBatchItemResult,
} from '../../application/use-cases/get-loyalty-balances-batch/get-loyalty-balances-batch.use-case';

@Controller('internal/loyalty')
export class InternalLoyaltyReadController {
  constructor(private readonly getLoyaltyBalancesBatch: GetLoyaltyBalancesBatchUseCase) {}

  // Batch lookup — used by the BFF to resolve loyalty balances for many customers in one
  // call (avoids the N+1 fan-out one-call-per-customer would otherwise require). Internal
  // routes skip the RequestInterceptor (no ambient X-Tenant-ID), so tenantId is an explicit
  // query param here, not read from RequestContext.
  @Get('balances')
  async getBalancesRoute(
    @Query('tenantId') tenantId: string | undefined,
    @Query('customerIds') customerIds: string | undefined,
  ): Promise<LoyaltyBalanceBatchItemResult[]> {
    if (!tenantId?.trim()) {
      throw throwProblemDetail(
        HttpStatus.BAD_REQUEST,
        GenericErrorCode.FIELD_REQUIRED,
        'tenantId query parameter is required',
        'tenantId',
      );
    }
    if (!customerIds?.trim()) {
      throw throwProblemDetail(
        HttpStatus.BAD_REQUEST,
        GenericErrorCode.FIELD_REQUIRED,
        'customerIds query parameter is required',
        'customerIds',
      );
    }
    const ids = customerIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
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
      .then((result) => result.items);
  }
}
