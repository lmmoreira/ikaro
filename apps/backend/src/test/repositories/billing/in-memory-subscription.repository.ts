import type { FeatureKey } from '@ikaro/validation';
import { ISubscriptionRepository } from '../../../contexts/billing/application/ports/subscription-repository.port';
import { SubscriptionAlreadyExistsError } from '../../../contexts/billing/domain/errors/billing-domain.error';
import type { Subscription } from '../../../contexts/billing/domain/subscription.aggregate';

export class InMemorySubscriptionRepository implements ISubscriptionRepository {
  readonly saved: Subscription[] = [];

  private nextFindError: unknown = null;

  /** The next `findByTenantId` rejects with this (a transient failure), then the double recovers. */
  failNextFind(error: unknown): void {
    this.nextFindError = error;
  }

  async findByTenantId(tenantId: string): Promise<Subscription | null> {
    if (this.nextFindError !== null) {
      const err = this.nextFindError;
      this.nextFindError = null;
      throw err;
    }
    return this.saved.find((subscription) => subscription.tenantId === tenantId) ?? null;
  }

  // No real row lock here: concurrency is proved against the real adapter in integration tests.
  async findByTenantIdForUpdate(tenantId: string): Promise<Subscription | null> {
    return this.findByTenantId(tenantId);
  }

  async listSuspendedTenantIds(): Promise<string[]> {
    return this.saved
      .filter((subscription) => subscription.status === 'SUSPENDED')
      .map((subscription) => subscription.tenantId);
  }

  // Operational and not on a trial (a trial grants every feature): no active item for the feature.
  async findTenantIdsNotEntitledTo(featureKey: FeatureKey, now: Date): Promise<string[]> {
    return this.saved
      .filter(
        (subscription) => subscription.status === 'ACTIVE' || subscription.status === 'PAST_DUE',
      )
      .filter(
        (subscription) =>
          !subscription.entitledAt(now).some((entry) => entry.featureKey === featureKey),
      )
      .map((subscription) => subscription.tenantId);
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
