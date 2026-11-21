import type { ProviderHealth } from '../../domain/provider-health';

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
}
