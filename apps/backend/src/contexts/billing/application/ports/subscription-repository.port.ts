import type { Subscription } from '../../domain/subscription.aggregate';

export const SUBSCRIPTION_REPOSITORY = Symbol('ISubscriptionRepository');

/** One subscription per tenant (`UNIQUE(tenant_id)`): the tenant id is its natural key. */
export interface ISubscriptionRepository {
  findByTenantId(tenantId: string): Promise<Subscription | null>;

  /**
   * Lock B-R1 (docs/LOCK_CATALOG.md): re-reads the whole aggregate — items included — under
   * `FOR UPDATE`. Must run inside an active `ITransactionManager.run()`; throws outside one. Every
   * use case that changes a subscription's status or period takes it first.
   */
  findByTenantIdForUpdate(tenantId: string): Promise<Subscription | null>;

  /**
   * Inserts a new subscription or updates a loaded one under its optimistic `version`
   * (`SubscriptionConcurrentModificationError` when the row moved). Writes the item rows only when
   * `subscription.itemsDirty`. A second subscription for a tenant is `SubscriptionAlreadyExistsError`.
   */
  save(subscription: Subscription): Promise<void>;
}
