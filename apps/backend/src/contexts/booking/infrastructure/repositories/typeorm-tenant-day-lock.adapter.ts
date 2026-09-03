import { Injectable } from '@nestjs/common';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ITenantDayLockPort } from '../../application/ports/tenant-day-lock.port';

@Injectable()
export class TypeOrmTenantDayLockAdapter implements ITenantDayLockPort {
  async lockTenantDay(tenantId: string, date: string): Promise<void> {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('Tenant-day lock requires an active transaction');
    }

    await manager.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1::text, 0::bigint)
       )`,
      [`${tenantId}:${date}`],
    );
  }
}
