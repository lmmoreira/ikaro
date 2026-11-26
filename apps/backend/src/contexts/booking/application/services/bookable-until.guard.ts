import { Inject, Injectable } from '@nestjs/common';
import {
  BOOKABLE_UNTIL_LOCK_PORT,
  type BookableUntilLockPort,
} from '../../../../shared/ports/bookable-until-lock.port';
import {
  TENANT_ACCESS_PORT,
  type TenantAccessPort,
} from '../../../../shared/ports/tenant-access.port';
import { assertEndsWithinBookableUntil } from '../use-cases/bookable-until.helpers';

/**
 * The one place a Booking path takes the bookable-until lock (docs/LOCK_CATALOG.md B-U1, M26-S18b).
 * Every route that creates or moves a commitment calls it **first inside its write transaction**:
 * it takes the lock in shared mode, then reads the cap uncached, so a plan save that removes
 * BOOKING (exclusive mode) is ordered against it. A path that does not call it reopens the race,
 * and nothing fails; that is why the lock and the read live in this one method.
 */
@Injectable()
export class BookableUntilGuard {
  constructor(
    @Inject(BOOKABLE_UNTIL_LOCK_PORT) private readonly lock: BookableUntilLockPort,
    @Inject(TENANT_ACCESS_PORT) private readonly access: TenantAccessPort,
  ) {}

  /** Takes the shared lock, then returns the authoritative cap. Must run inside a transaction. */
  async acquire(tenantId: string): Promise<string | null> {
    await this.lock.lockCommitmentsShared(tenantId);
    return this.access.getBookableUntil(tenantId);
  }

  /** `acquire`, then refuses a single commitment whose end is past the cap. */
  async assertEndsWithin(tenantId: string, endsAt: Date, timezone: string): Promise<void> {
    const bookableUntil = await this.acquire(tenantId);
    assertEndsWithinBookableUntil(endsAt, bookableUntil, timezone);
  }
}
