import type { ProviderHealth, ProviderWebhookStatus } from '../../domain/provider-health';

export const PROVIDER_HEALTH_REPOSITORY = Symbol('IProviderHealthRepository');

/**
 * `billing.provider_health`: one platform-wide row per merchant profile key (no `tenant_id`). The
 * status sweep reads the frozen keys (UC-115 A4); reconcile (M26-S07) and self-heal (M26-S08) write.
 */
export interface IProviderHealthRepository {
  findByKey(merchantProfileKey: string): Promise<ProviderHealth | null>;

  /**
   * The merchant profile keys whose suspension freeze is on. The table holds a handful of rows (one
   * per provider account), so the status sweep reads it once per run and asks the set per
   * subscription; a key with no row is simply absent, which means not frozen.
   */
  listFrozenKeys(): Promise<string[]>;

  /** Inserts the row or updates the existing one (the key is the primary key). */
  save(health: ProviderHealth): Promise<void>;

  /**
   * Reconcile's write (UC-116): the key's last reconcile pass that completed with a successful
   * provider call, and, for a complete full pass, the last full one. A column-scoped upsert: it
   * sets only those columns (and `updated_at`) and leaves the freeze and the webhook status as
   * whoever wrote them last left them, so a pass that ran for minutes can never overwrite a freeze
   * written meanwhile (`save` writes every column from the row it was handed). A key with no row
   * gets one with the columns' defaults (not frozen, webhook status unknown).
   */
  recordReconcileOk(merchantProfileKey: string, at: Date, fullPass: boolean): Promise<void>;

  /**
   * Self-heal's write after a successful provider health read (UC-140): the webhook status and the
   * failed-read counter reset to 0, as a column-scoped upsert (it never touches the freeze or the
   * reconcile instants). `reenabled` also stamps `updated_at`, the instant a webhook delivery must
   * post-date to close the alert; a plain read leaves it. A key with no row gets one.
   */
  recordHealthReadOk(
    merchantProfileKey: string,
    webhookStatus: ProviderWebhookStatus,
    at: Date,
    reenabled: boolean,
  ): Promise<void>;

  /**
   * Self-heal's write after a failed provider health read: one atomic increment of the consecutive
   * failed-read counter (creating the row when absent). Returns the new count.
   */
  recordHealthReadFailure(merchantProfileKey: string, at: Date): Promise<number>;

  /**
   * Starts (`since` = an instant) or ends (`null`) the suspension freeze: `freeze_active` and
   * `freeze_since` change together, and only when the state really changes. Returns `false` when
   * the row was already in the requested state (or absent).
   */
  setFreeze(merchantProfileKey: string, since: Date | null): Promise<boolean>;
}
