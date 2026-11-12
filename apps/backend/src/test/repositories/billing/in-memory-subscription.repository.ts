import { ISubscriptionRepository } from '../../../contexts/billing/application/ports/subscription-repository.port';
import { SubscriptionAlreadyExistsError } from '../../../contexts/billing/domain/errors/billing-domain.error';
import type { Subscription } from '../../../contexts/billing/domain/subscription.aggregate';

export class InMemorySubscriptionRepository implements ISubscriptionRepository {
  readonly saved: Subscription[] = [];

  async findByTenantId(tenantId: string): Promise<Subscription | null> {
    return this.saved.find((subscription) => subscription.tenantId === tenantId) ?? null;
  }

  // No real row lock here: concurrency is proved against the real adapter in integration tests.
  async findByTenantIdForUpdate(tenantId: string): Promise<Subscription | null> {
    return this.findByTenantId(tenantId);
  }

  // Mirrors `UNIQUE(tenant_id)`: a never-persisted aggregate for a tenant that has one is refused.
  async save(subscription: Subscription): Promise<void> {
    const index = this.saved.findIndex((row) => row.tenantId === subscription.tenantId);
    if (index === -1) {
      this.saved.push(subscription);
      return;
    }
    if (subscription.version === undefined) throw new SubscriptionAlreadyExistsError();
    this.saved[index] = subscription;
  }
}
