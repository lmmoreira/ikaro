import type { FeatureKey } from '@ikaro/validation';
import { drainDomainEvents } from '../../../shared/infrastructure/outbox/drain-domain-events';
import { IOutboxPublisher } from '../../../shared/ports/outbox-publisher.port';
import {
  ISubscriptionRepository,
  ListOperatorSubscriptionsQuery,
  OperatorSubscriptionSummary,
} from '../../../contexts/billing/application/ports/subscription-repository.port';
import { SubscriptionAlreadyExistsError } from '../../../contexts/billing/domain/errors/billing-domain.error';
import type { Subscription } from '../../../contexts/billing/domain/subscription.aggregate';

export class InMemorySubscriptionRepository implements ISubscriptionRepository {
  readonly saved: Subscription[] = [];

  private nextFindError: unknown = null;

  constructor(private readonly outboxPublisher: IOutboxPublisher = { publish: async () => {} }) {}

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
    // Oldest suspension first, like the production query's `ORDER BY suspended_at`.
    return this.saved
      .filter((subscription) => subscription.status === 'SUSPENDED')
      .sort((a, b) => (a.suspendedAt?.getTime() ?? 0) - (b.suspendedAt?.getTime() ?? 0))
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

  // Newest first = reverse insertion order (the double has no `created_at`).
  async listSummaries(
    query: ListOperatorSubscriptionsQuery,
  ): Promise<{ items: OperatorSubscriptionSummary[]; total: number }> {
    const matching = [...this.saved]
      .reverse()
      .filter((subscription) => query.status === undefined || subscription.status === query.status);
    return {
      items: matching.slice(query.offset, query.offset + query.limit).map((subscription) => ({
        tenantId: subscription.tenantId,
        status: subscription.status,
        suspensionReason: subscription.suspensionReason,
        exempt: subscription.exempt,
        trialEndsAt: subscription.trialEndsAt,
        graceUntil: subscription.graceUntil,
        pastDueSince: subscription.pastDueSince,
        suspendedAt: subscription.suspendedAt,
        hasEverPaid: subscription.hasEverPaid,
      })),
      total: matching.length,
    };
  }

  // Mirrors `UNIQUE(tenant_id)`: a never-persisted aggregate for a tenant that has one is refused.
  async save(subscription: Subscription): Promise<void> {
    const index = this.saved.findIndex((row) => row.tenantId === subscription.tenantId);
    if (index === -1) {
      this.saved.push(subscription);
    } else {
      if (subscription.version === undefined) throw new SubscriptionAlreadyExistsError();
      this.saved[index] = subscription;
    }
    await drainDomainEvents(subscription, this.outboxPublisher);
  }
}
