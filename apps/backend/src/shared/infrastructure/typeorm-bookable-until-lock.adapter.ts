import { Injectable } from '@nestjs/common';
import type { BookableUntilLockPort } from '../ports/bookable-until-lock.port';
import { getActiveEntityManager } from './transaction-context';

// Brand-new key (M26-S18b), namespaced from day one: a key cannot change once it has protected
// real traffic, because a rolling deploy runs old and new code side by side.
const KEY_PREFIX = 'bookable-until:';

@Injectable()
export class TypeOrmBookableUntilLockAdapter implements BookableUntilLockPort {
  async lockCommitmentsShared(tenantId: string): Promise<void> {
    await this.acquire('pg_advisory_xact_lock_shared', tenantId);
  }

  async lockCommitmentsExclusive(tenantId: string): Promise<void> {
    await this.acquire('pg_advisory_xact_lock', tenantId);
  }

  private async acquire(
    fn: 'pg_advisory_xact_lock_shared' | 'pg_advisory_xact_lock',
    tenantId: string,
  ): Promise<void> {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('Bookable-until lock requires an active transaction');
    }
    // `fn` is one of the two literals above, never caller input.
    await manager.query(`SELECT ${fn}(hashtextextended($1::text, 0::bigint))`, [
      `${KEY_PREFIX}${tenantId}`,
    ]);
  }
}
