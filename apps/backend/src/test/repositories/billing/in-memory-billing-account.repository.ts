import { IBillingAccountRepository } from '../../../contexts/billing/application/ports/billing-account-repository.port';
import type {
  BillingAccount,
  BillingProvider,
} from '../../../contexts/billing/domain/billing-account.aggregate';
import { BillingAccountAlreadyExistsError } from '../../../contexts/billing/domain/errors/billing-domain.error';

export class InMemoryBillingAccountRepository implements IBillingAccountRepository {
  readonly saved: BillingAccount[] = [];

  async findByTenantId(tenantId: string): Promise<BillingAccount | null> {
    return this.saved.find((account) => account.tenantId === tenantId) ?? null;
  }

  // The in-memory double has no concurrency to order; it keeps the contract's one observable rule.
  async findByTenantIdForUpdate(tenantId: string): Promise<BillingAccount | null> {
    return this.findByTenantId(tenantId);
  }

  async findByProviderCustomerIdForJob(
    provider: BillingProvider,
    providerCustomerId: string,
  ): Promise<BillingAccount | null> {
    return (
      this.saved.find(
        (account) =>
          account.provider === provider && account.providerCustomerId === providerCustomerId,
      ) ?? null
    );
  }

  // Mirrors the single-column UPDATE: the first customer is kept, the same one again succeeds.
  async assignProviderCustomer(
    tenantId: string,
    provider: BillingProvider,
    providerCustomerId: string,
  ): Promise<boolean> {
    const account = this.saved.find((row) => row.tenantId === tenantId);
    if (!account) return false;
    account.assignProviderCustomer(provider, providerCustomerId);
    return account.provider === provider && account.providerCustomerId === providerCustomerId;
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
