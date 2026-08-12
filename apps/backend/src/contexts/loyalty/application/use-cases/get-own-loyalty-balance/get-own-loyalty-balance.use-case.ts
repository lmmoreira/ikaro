import { Inject, Injectable } from '@nestjs/common';
import { ILoyaltyCustomerPort, LOYALTY_CUSTOMER_PORT } from '../../ports/loyalty-customer.port';
import {
  LoyaltyBalanceReaderService,
  type LoyaltyBalanceResult,
} from '../../services/loyalty-balance-reader.service';

export interface GetOwnLoyaltyBalanceUseCaseInput {
  contextTenantId: string;
  targetTenantId: string;
  actorId: string;
}

export interface GetOwnLoyaltyBalanceUseCaseResult {
  balance: LoyaltyBalanceResult;
  isCrossTenant: boolean;
}

// Resolves the calling customer's own balance — same tenant, or a different tenant they're
// also linked to (switch-tenant screen, TD20). Never accepts a client-supplied customerId:
// the target customer is always the actor themselves, resolved via their Google OAuth ID
// for cross-tenant calls.
@Injectable()
export class GetOwnLoyaltyBalanceUseCase {
  constructor(
    private readonly balanceReader: LoyaltyBalanceReaderService,
    @Inject(LOYALTY_CUSTOMER_PORT) private readonly loyaltyCustomer: ILoyaltyCustomerPort,
  ) {}

  async execute(
    input: GetOwnLoyaltyBalanceUseCaseInput,
  ): Promise<GetOwnLoyaltyBalanceUseCaseResult> {
    const { contextTenantId, targetTenantId, actorId } = input;
    const isCrossTenant = targetTenantId !== contextTenantId;

    const customerId = isCrossTenant
      ? await this.loyaltyCustomer.resolveCustomerIdByOAuthId(
          actorId,
          contextTenantId,
          targetTenantId,
        )
      : actorId;

    const balance = await this.balanceReader.read(targetTenantId, customerId);
    return { balance, isCrossTenant };
  }
}
