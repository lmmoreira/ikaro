import { Inject, Injectable } from '@nestjs/common';
import {
  BOOKABLE_UNTIL_LOCK_PORT,
  type BookableUntilLockPort,
} from '../../../../shared/ports/bookable-until-lock.port';
import {
  TENANT_ACCESS_PORT,
  type TenantAccessPort,
} from '../../../../shared/ports/tenant-access.port';
import { assertEndsWithinBookableUntil, commitmentEnd } from '../use-cases/bookable-until.helpers';

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

  /**
   * `acquire`, then refuses one commitment that starts at `startsAt` and runs `durationMins`
   * minutes when its end is past the cap. The end is derived here, once, so a path that creates or
   * moves a booking never re-implements what a commitment's end is.
   */
  async assertCommitmentEndsWithin(
    tenantId: string,
    commitment: { startsAt: Date; durationMins: number },
    timezone: string,
  ): Promise<void> {
    const bookableUntil = await this.acquire(tenantId);
    assertEndsWithinBookableUntil(
      commitmentEnd(commitment.startsAt, commitment.durationMins),
      bookableUntil,
      timezone,
    );
  }
}
