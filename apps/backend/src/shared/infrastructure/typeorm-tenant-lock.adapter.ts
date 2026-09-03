import { Injectable } from '@nestjs/common';
import { getActiveEntityManager } from './transaction-context';
import { ITenantLockPort } from '../ports/tenant-lock.port';

@Injectable()
export class TypeOrmTenantLockAdapter implements ITenantLockPort {
  async lockTenantDay(tenantId: string, date: string): Promise<void> {
    await this.acquire(`${tenantId}:${date}`);
  }

  async lockTenantSettings(tenantId: string): Promise<void> {
    await this.acquire(`${tenantId}:settings`);
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
