import type { FeatureKey } from '@ikaro/validation';
import type { Subscription } from '../../domain/subscription.aggregate';

export const SUBSCRIPTION_REPOSITORY = Symbol('ISubscriptionRepository');

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
}
