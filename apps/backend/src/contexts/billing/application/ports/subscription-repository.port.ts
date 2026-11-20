import type { FeatureKey } from '@ikaro/validation';
import type {
  Subscription,
  SubscriptionStatus,
  SuspensionReason,
} from '../../domain/subscription.aggregate';

export const SUBSCRIPTION_REPOSITORY = Symbol('ISubscriptionRepository');

/** One row of the operator's investigation list: subscription-derived facts only (M25-S15b). */
export interface OperatorSubscriptionSummary {
  tenantId: string;
  status: SubscriptionStatus;
  suspensionReason: SuspensionReason | null;
  exempt: boolean;
  trialEndsAt: Date | null;
  graceUntil: Date | null;
  pastDueSince: Date | null;
  suspendedAt: Date | null;
  hasEverPaid: boolean;
}

/** A subscription the issue job may be due to invoice, and its place in the selection order. */
export interface DueIssueRef {
  tenantId: string;
  /** `YYYY-MM-DD`. */
  nextDueDate: string;
}

export interface ListOperatorSubscriptionsQuery {
  status?: SubscriptionStatus;
  limit: number;
  offset: number;
}

/** One subscription per tenant (`UNIQUE(tenant_id)`): the tenant id is its natural key. */
export interface ISubscriptionRepository {
  findByTenantId(tenantId: string): Promise<Subscription | null>;

  /**
   * Lock B-R1 (docs/LOCK_CATALOG.md): takes `FOR UPDATE` on the subscription row, then loads its
   * items in the same transaction — safe because every writer takes the row lock first, so the
   * items cannot change underneath. Must run inside an active `ITransactionManager.run()`; throws
   * outside one. Every use case that changes a subscription's status or period takes it first.
   */
  findByTenantIdForUpdate(tenantId: string): Promise<Subscription | null>;

  /**
   * Inserts a new subscription or updates a loaded one under its optimistic `version`
   * (`SubscriptionConcurrentModificationError` when the row moved). Writes the item rows only when
   * `subscription.itemsDirty`. A second subscription for a tenant is `SubscriptionAlreadyExistsError`.
   */
  save(subscription: Subscription): Promise<void>;

  /**
   * Cross-tenant system read (UC-120 A4): ids of `SUSPENDED` subscriptions, oldest suspension
   * first. Served by the standalone partial index `IDX_billing_subscriptions_suspended_at`.
   * Ids only, never another tenant's state.
   */
  listSuspendedTenantIds(): Promise<string[]>;

  /**
   * Cross-tenant system read (UC-120 A4): ids of operational tenants that are not on a trial (a
   * trial grants every feature) and have no item for `featureKey` active at `now`. Ids only.
   */
  findTenantIdsNotEntitledTo(featureKey: FeatureKey, now: Date): Promise<string[]>;

  /**
   * Cross-tenant job selector (UC-113, M26-S05): one page of the `TRIALING` / `ACTIVE`, non-exempt
   * subscriptions whose `next_due_date` is on or before `dueOnOrBefore` (a `YYYY-MM-DD` the caller
   * widened by one day of slack, because the date is in each subscription's own zone), ordered by
   * `(next_due_date, tenant_id)`, at most `limit`, starting after the `after` row. A subscription
   * the job skips (held identity, deactivated tenant, missing price) stays due, so the caller pages
   * on from the last row it was given instead of asking for the head again, or it would never get
   * past the skipped ones. Ids and dates only: the job re-reads each one under B-R1 and re-checks
   * the date in the subscription's zone. Served by the standalone partial index
   * `IDX_billing_subscriptions_issuing`; the predicate must repeat the index's literally.
   */
  findDueForIssueForJob(
    dueOnOrBefore: string,
    limit: number,
    after?: DueIssueRef,
  ): Promise<DueIssueRef[]>;

  /**
   * Cross-tenant operator read (UC-111): one page of subscription summaries, newest-created first
   * (id as tiebreak), optionally narrowed to one status, with the unpaged total. It reads the
   * subscription row only (no items, no other context's data) and serves a manual lookup over one
   * row per tenant, so it needs no index of its own.
   */
  listSummaries(
    query: ListOperatorSubscriptionsQuery,
  ): Promise<{ items: OperatorSubscriptionSummary[]; total: number }>;
}
