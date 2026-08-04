import { Inject, Injectable } from '@nestjs/common';
import {
  ILoyaltyBalanceRepository,
  LOYALTY_BALANCE_REPOSITORY,
} from '../../ports/loyalty-balance-repository.port';
import { ILoyaltyCustomerPort, LOYALTY_CUSTOMER_PORT } from '../../ports/loyalty-customer.port';

export interface GetOwnLoyaltyBalancesUseCaseInput {
  contextTenantId: string;
  actorId: string;
}

export interface LoyaltyBalanceByTenantResult {
  tenantId: string;
  currentPoints: number;
}

// Resolves the calling customer's own balance across every tenant they're linked to (same
// Google OAuth user, one Customer row per tenant — the switch-tenant screen, TD20). The
// tenant/customerId pairs are always derived from the actor's own identity, never accepted
// from a caller — see ILoyaltyCustomerPort.resolveAllTenantsByOAuthId.
@Injectable()
export class GetOwnLoyaltyBalancesUseCase {
  constructor(
    @Inject(LOYALTY_BALANCE_REPOSITORY) private readonly balanceRepo: ILoyaltyBalanceRepository,
    @Inject(LOYALTY_CUSTOMER_PORT) private readonly loyaltyCustomer: ILoyaltyCustomerPort,
  ) {}

  async execute(input: GetOwnLoyaltyBalancesUseCaseInput): Promise<LoyaltyBalanceByTenantResult[]> {
    const { contextTenantId, actorId } = input;
    const pairs = await this.loyaltyCustomer.resolveAllTenantsByOAuthId(actorId, contextTenantId);
    const balances = await this.balanceRepo.findManyByTenantCustomerPairs(pairs);
    const pointsByTenant = new Map(balances.map((b) => [b.tenantId, b.currentPoints]));

    return pairs.map((pair) => ({
      tenantId: pair.tenantId,
      currentPoints: pointsByTenant.get(pair.tenantId) ?? 0,
    }));
  }
}
