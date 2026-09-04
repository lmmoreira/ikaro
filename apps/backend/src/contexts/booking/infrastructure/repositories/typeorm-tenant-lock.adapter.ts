import { Injectable } from '@nestjs/common';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ITenantLockPort } from '../../application/ports/tenant-lock.port';

@Injectable()
export class TypeOrmTenantLockAdapter implements ITenantLockPort {
  // Key format intentionally left unchanged from its pre-M21-S06 shape — renaming a key already
  // live in production would desynchronize an old and a new instance during a rolling/blue-green
  // deploy (each would hash a different key for the same (tenantId, date), silently reopening the
  // M21-S03 race for the deploy window). Only the brand-new lockTenantStaff key below gets a
  // namespace prefix, since it has no prior deployed version to be incompatible with.
  async lockTenantDay(tenantId: string, date: string): Promise<void> {
    await this.acquire(`${tenantId}:${date}`);
  }

  async lockTenantStaff(tenantId: string, staffId: string): Promise<void> {
    await this.acquire(`tenantstaff:${tenantId}:${staffId}`);
  }

  private async acquire(key: string): Promise<void> {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('Tenant lock requires an active transaction');
    }

    await manager.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1::text, 0::bigint)
       )`,
      [key],
    );
  }
}
