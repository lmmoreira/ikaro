import { Inject, Injectable } from '@nestjs/common';
import type { BillingChargesResponse } from '@ikaro/types';
import { toHistoryItem } from '../helpers/billing-summary.helper';
import { CHARGE_REPOSITORY, type IChargeRepository } from '../ports/charge-repository.port';

export interface ListBillingChargesUseCaseInput {
  tenantId: string;
  limit: number;
  offset: number;
}

export type ListBillingChargesUseCaseResult = BillingChargesResponse;

/**
 * UC-117: the manager's charge history, newest due date first (Pattern A). It reads the tenant's own
 * charges only; a tenant with no charge, or no subscription yet, is an empty page, never an error.
 */
@Injectable()
export class ListBillingChargesUseCase {
  constructor(@Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository) {}

  async execute(input: ListBillingChargesUseCaseInput): Promise<ListBillingChargesUseCaseResult> {
    const { tenantId, limit, offset } = input;
    const { items, total } = await this.charges.listByTenantPage(tenantId, { limit, offset });
    return {
      items: items.map(toHistoryItem),
      pagination: { limit, offset, total, hasMore: offset + limit < total },
    };
  }
}
