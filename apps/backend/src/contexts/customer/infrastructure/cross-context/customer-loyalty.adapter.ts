import { Injectable } from '@nestjs/common';
import { LoyaltyQueryService } from '../../../loyalty/application/services/loyalty-query.service';
import { ICustomerLoyaltyPort } from '../../application/ports/customer-loyalty.port';

@Injectable()
export class CustomerLoyaltyAdapter implements ICustomerLoyaltyPort {
  constructor(private readonly loyaltyQueryService: LoyaltyQueryService) {}

  getCurrentPoints(tenantId: string, customerId: string): Promise<number> {
    return this.loyaltyQueryService.getCurrentPoints(tenantId, customerId);
  }
}
