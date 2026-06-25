import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  GetLoyaltyBalanceUseCase,
  GetLoyaltyBalanceResult,
} from '../../application/use-cases/get-loyalty-balance/get-loyalty-balance.use-case';

@Controller('internal/customers')
export class InternalLoyaltyController {
  constructor(private readonly getLoyaltyBalance: GetLoyaltyBalanceUseCase) {}

  @Get(':customerId/loyalty/balance')
  getBalance(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query('tenantId') tenantId: string,
  ): Promise<GetLoyaltyBalanceResult> {
    if (!tenantId) {
      throw new BadRequestException({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'tenantId query parameter is required',
      });
    }
    return this.getLoyaltyBalance.execute({ tenantId, customerId });
  }
}
