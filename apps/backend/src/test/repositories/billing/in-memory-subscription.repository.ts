import type { FeatureKey } from '@ikaro/validation';
import { drainDomainEvents } from '../../../shared/infrastructure/outbox/drain-domain-events';
import { IOutboxPublisher } from '../../../shared/ports/outbox-publisher.port';
import {
  DueIssueRef,
  ISubscriptionRepository,
  ListOperatorSubscriptionsQuery,
  OperatorSubscriptionSummary,
  SweepDueRef,
} from '../../../contexts/billing/application/ports/subscription-repository.port';
import { SubscriptionAlreadyExistsError } from '../../../contexts/billing/domain/errors/billing-domain.error';
import { GRACE_DAYS } from '../../../contexts/billing/domain/subscription.types';
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

  // The TRIALING / ACTIVE, non-exempt subscriptions due on or before the date, in the production
  // order (due date, then tenant), one page after the given row.
  async findDueForIssueForJob(
    dueOnOrBefore: string,
    limit: number,
    after?: DueIssueRef,
  ): Promise<DueIssueRef[]> {
    const key = (ref: DueIssueRef): string => `${ref.nextDueDate}|${ref.tenantId}`;
    return this.saved
      .flatMap((subscription) =>
        (subscription.status === 'TRIALING' || subscription.status === 'ACTIVE') &&
        !subscription.exempt &&
        subscription.nextDueDate !== null &&
        subscription.nextDueDate.value <= dueOnOrBefore
          ? [{ tenantId: subscription.tenantId, nextDueDate: subscription.nextDueDate.value }]
          : [],
      )
      .filter((ref) => after === undefined || key(ref) > key(after))
      .sort((a, b) => key(a).localeCompare(key(b)))
      .slice(0, limit);
  }

  // The status sweep's selectors: the production predicates, ordered by (instant, tenant) and
  // paged by the same keyset.
  async findTrialEndedForJob(
    now: Date,
    limit: number,
    after?: SweepDueRef,
  ): Promise<SweepDueRef[]> {
    return this.sweepPage(
      this.saved.flatMap((s) =>
        s.status === 'TRIALING' &&
        !s.exempt &&
        s.trialEndsAt !== null &&
        s.trialEndsAt.getTime() <= now.getTime()
          ? [{ tenantId: s.tenantId, dueAt: s.trialEndsAt }]
          : [],
      ),
      limit,
      after,
    );
  }

  async findGraceExpiredForJob(
    now: Date,
    limit: number,
    after?: SweepDueRef,
  ): Promise<SweepDueRef[]> {
    const cutoff = now.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000;
    return this.sweepPage(
      this.saved.flatMap((s) =>
        s.status === 'PAST_DUE' &&
        !s.exempt &&
        s.pastDueSince !== null &&
        s.pastDueSince.getTime() <= cutoff &&
        (s.graceUntil === null || s.graceUntil.getTime() <= now.getTime())
          ? [{ tenantId: s.tenantId, dueAt: s.pastDueSince }]
          : [],
      ),
      limit,
      after,
    );
  }

  async findExistingTenantIds(tenantIds: readonly string[]): Promise<string[]> {
    const wanted = new Set(tenantIds);
    return this.saved.filter((s) => wanted.has(s.tenantId)).map((s) => s.tenantId);
  }

  async listMerchantProfileKeys(): Promise<string[]> {
    return [...new Set(this.saved.map((s) => s.merchantProfileKey))].sort((a, b) =>
      a.localeCompare(b),
    );
  }

  async findCancelDueForJob(now: Date, limit: number, after?: SweepDueRef): Promise<SweepDueRef[]> {
    return this.sweepPage(
      this.saved.flatMap((s) =>
        s.cancelAt !== null &&
        s.cancelAt.getTime() <= now.getTime() &&
        !s.exempt &&
        s.status !== 'SUSPENDED'
          ? [{ tenantId: s.tenantId, dueAt: s.cancelAt }]
          : [],
      ),
      limit,
      after,
    );
  }

  private sweepPage(refs: SweepDueRef[], limit: number, after?: SweepDueRef): SweepDueRef[] {
    const key = (ref: SweepDueRef): string =>
      `${String(ref.dueAt.getTime()).padStart(16, '0')}|${ref.tenantId}`;
    return refs
      .filter((ref) => after === undefined || key(ref) > key(after))
      .sort((a, b) => key(a).localeCompare(key(b)))
      .slice(0, limit);
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
