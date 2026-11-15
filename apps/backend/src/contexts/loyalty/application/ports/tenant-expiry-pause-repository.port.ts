import type { ExpiryPause } from '../../domain/effective-expiry';

export const TENANT_EXPIRY_PAUSE_REPOSITORY = Symbol('TENANT_EXPIRY_PAUSE_REPOSITORY');

export interface ITenantExpiryPauseRepository {
  /**
   * Records the start of a suspension span, open. A span that already exists (open or closed) is
   * left untouched, so a late or redelivered suspend event never reopens a closed span.
   */
  recordOpen(tenantId: string, pausedAt: Date): Promise<void>;
  /** Records the span closed at `resumedAt`, whether or not its suspend event arrived first. */
  recordClosed(tenantId: string, pausedAt: Date, resumedAt: Date): Promise<void>;
  /** Every span of the given tenants, grouped by tenant id; tenants with none are absent. */
  findByTenantIds(tenantIds: readonly string[]): Promise<Map<string, ExpiryPause[]>>;
}
