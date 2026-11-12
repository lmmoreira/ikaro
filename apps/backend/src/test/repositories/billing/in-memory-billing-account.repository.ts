import { IBillingAccountRepository } from '../../../contexts/billing/application/ports/billing-account-repository.port';
import type { BillingAccount } from '../../../contexts/billing/domain/billing-account.aggregate';
import { BillingAccountAlreadyExistsError } from '../../../contexts/billing/domain/errors/billing-domain.error';

export class InMemoryBillingAccountRepository implements IBillingAccountRepository {
  readonly saved: BillingAccount[] = [];

  async findByTenantId(tenantId: string): Promise<BillingAccount | null> {
    return this.saved.find((account) => account.tenantId === tenantId) ?? null;
  }

  // Mirrors `UNIQUE(tenant_id)`: a second account for one tenant is refused.
  async save(account: BillingAccount): Promise<void> {
    const index = this.saved.findIndex((row) => row.tenantId === account.tenantId);
    if (index === -1) {
      this.saved.push(account);
      return;
    }
    if (this.saved[index] === account) return;
    throw new BillingAccountAlreadyExistsError();
  }
}
