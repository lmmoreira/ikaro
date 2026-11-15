import { ITenantExpiryPauseRepository } from '../../../contexts/loyalty/application/ports/tenant-expiry-pause-repository.port';
import type { ExpiryPause } from '../../../contexts/loyalty/domain/effective-expiry';

interface PauseRow {
  tenantId: string;
  pausedAt: Date;
  resumedAt: Date | null;
}

export class InMemoryTenantExpiryPauseRepository implements ITenantExpiryPauseRepository {
  readonly rows: PauseRow[] = [];

  async recordOpen(tenantId: string, pausedAt: Date): Promise<void> {
    if (this.find(tenantId, pausedAt)) return;
    this.rows.push({ tenantId, pausedAt, resumedAt: null });
  }

  async recordClosed(tenantId: string, pausedAt: Date, resumedAt: Date): Promise<void> {
    const existing = this.find(tenantId, pausedAt);
    if (existing) {
      existing.resumedAt = resumedAt;
      return;
    }
    this.rows.push({ tenantId, pausedAt, resumedAt });
  }

  async findByTenantIds(tenantIds: readonly string[]): Promise<Map<string, ExpiryPause[]>> {
    const byTenant = new Map<string, ExpiryPause[]>();
    for (const row of this.rows) {
      if (!tenantIds.includes(row.tenantId)) continue;
      const pauses = byTenant.get(row.tenantId) ?? [];
      pauses.push({ pausedAt: row.pausedAt, resumedAt: row.resumedAt });
      byTenant.set(row.tenantId, pauses);
    }
    return byTenant;
  }

  clear(): void {
    this.rows.length = 0;
  }

  private find(tenantId: string, pausedAt: Date): PauseRow | undefined {
    return this.rows.find(
      (r) => r.tenantId === tenantId && r.pausedAt.getTime() === pausedAt.getTime(),
    );
  }
}
