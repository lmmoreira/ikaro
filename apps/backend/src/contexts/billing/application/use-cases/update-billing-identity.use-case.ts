import { Inject, Injectable } from '@nestjs/common';
import type { BillingIdentityReadyResponse } from '@ikaro/types';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { EmailValidationError } from '../../../../shared/value-objects/email.vo';
import { TaxIdValidationError } from '../../../../shared/value-objects/tax-id.vo';
import type { BillingAccount } from '../../domain/billing-account.aggregate';
import type { BillingIdentityPatch } from '../../domain/billing-identity';
import {
  BillingIdentityEmailInvalidError,
  BillingIdentityTaxIdInvalidError,
  BillingProvisioningError,
} from '../../domain/errors/billing-domain.error';
import { toBillingIdentityResponse } from '../helpers/billing-identity.helper';
import {
  BILLING_ACCOUNT_REPOSITORY,
  type IBillingAccountRepository,
} from '../ports/billing-account-repository.port';

export interface UpdateBillingIdentityUseCaseInput extends BillingIdentityPatch {
  tenantId: string;
}

export type UpdateBillingIdentityUseCaseResult = BillingIdentityReadyResponse;

// The shared value objects keep their own codes for every other caller (a signup's `SIGNUP_TAX_ID_*`,
// the generic email code); the identity save speaks Billing's. The address errors keep the shared
// mapper's.
function applyPatch(account: BillingAccount, patch: BillingIdentityPatch): void {
  try {
    account.updateIdentity(patch);
  } catch (err) {
    if (err instanceof TaxIdValidationError) {
      throw new BillingIdentityTaxIdInvalidError(err.message);
    }
    // The VO's message quotes the address, which is PII: the Billing error carries a fixed one.
    if (err instanceof EmailValidationError) {
      throw new BillingIdentityEmailInvalidError('The billing email is not a valid address');
    }
    throw err;
  }
}

/**
 * UC-118: the manager's partial edit of the billing identity. The account row is read under its
 * lock (B-I1, `docs/LOCK_CATALOG.md`) inside the transaction that saves it, because `save()`
 * rewrites every column and a copy read earlier could put back a provider customer another writer
 * stored in between. Saving never calls the provider: the identity is synced to the provider
 * customer the next time a charge is issued (UC-113), and a held subscription is issued by the
 * next job run with no re-trigger. Tax id, legal name and email are PII and are never logged.
 */
@Injectable()
export class UpdateBillingIdentityUseCase {
  constructor(
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  execute(input: UpdateBillingIdentityUseCaseInput): Promise<UpdateBillingIdentityUseCaseResult> {
    const { tenantId, ...patch } = input;
    return this.txManager.run(async () => {
      const account = await this.accounts.findByTenantIdForUpdate(tenantId);
      if (!account) throw new BillingProvisioningError();
      applyPatch(account, patch);
      await this.accounts.save(account);
      return toBillingIdentityResponse(account);
    });
  }
}
