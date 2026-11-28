import { Inject, Injectable } from '@nestjs/common';
import type { BillingIdentityResponse } from '@ikaro/types';
import { toBillingIdentityResponse } from '../helpers/billing-identity.helper';
import {
  BILLING_ACCOUNT_REPOSITORY,
  type IBillingAccountRepository,
} from '../ports/billing-account-repository.port';

export interface GetBillingIdentityUseCaseInput {
  tenantId: string;
}

export type GetBillingIdentityUseCaseResult = BillingIdentityResponse;

/**
 * UC-118: the billing identity the "Dados de cobrança" tab edits. It takes no lock. A tenant with no
 * billing account yet (the provisioning window, UC-117 A9) is the provisioning answer, not an error.
 */
@Injectable()
export class GetBillingIdentityUseCase {
  constructor(
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
  ) {}

  async execute(input: GetBillingIdentityUseCaseInput): Promise<GetBillingIdentityUseCaseResult> {
    const account = await this.accounts.findByTenantId(input.tenantId);
    if (!account) return { provisioning: true };
    return toBillingIdentityResponse(account);
  }
}
