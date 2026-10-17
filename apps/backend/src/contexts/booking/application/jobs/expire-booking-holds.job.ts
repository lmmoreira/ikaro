import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { BookingConcurrentModificationError } from '../../domain/errors/booking-domain.error';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import {
  FUTURE_COMMITMENT_EXCEPTION_REPOSITORY,
  IFutureCommitmentExceptionRepository,
} from '../ports/future-commitment-exception-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import {
  saveTerminalBookingsInTransaction,
  TerminalBookingDeps,
} from '../use-cases/booking-exception-closing.helpers';

export interface ExpireBookingHoldsJobResult {
  expired: number;
}

// TD51 — a manual-approval request nobody decided within its hold is cancelled by the system, its
// slot released and the customer told. Same shape as the recurring-schedule expiry job: tenants
// one after another, every query tenant-scoped, one transaction per booking so a single failure
// never blocks the rest, and a failure is logged and retried by the next 30-minute run. Only
// PENDING expires: an INFO_REQUESTED booking is waiting on the customer, not on staff.
@Injectable()
export class ExpireBookingHoldsJob {
  private readonly logger = new AppLogger(ExpireBookingHoldsJob.name);

  constructor(
    @Inject(BOOKING_PLATFORM_PORT) private readonly tenantPort: IBookingPlatformPort,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(FUTURE_COMMITMENT_EXCEPTION_REPOSITORY)
    private readonly exceptionRepo: IFutureCommitmentExceptionRepository,
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async run(now: Date = new Date()): Promise<ExpireBookingHoldsJobResult> {
    const tenants = await this.tenantPort.findAllActive();
    const perTenant = await mapSequentially(tenants, (tenant) =>
      this.expireForTenant(tenant.id, now),
    );
    return { expired: perTenant.reduce((sum, count) => sum + count, 0) };
  }

  private get closingDeps(): TerminalBookingDeps {
    return {
      bookingRepo: this.bookingRepo,
      occupancyRepo: this.occupancyRepo,
      exceptionRepo: this.exceptionRepo,
      tenantLock: this.tenantLock,
    };
  }

  // One tenant's pass, public so a test can run it without sweeping every tenant of a shared
  // database. Returns how many bookings it expired.
  async expireForTenant(tenantId: string, now: Date = new Date()): Promise<number> {
    const candidates = await this.bookingRepo.findPendingWithExpiredHold(tenantId, now);
    const outcomes = await mapSequentially(candidates, (booking) =>
      this.expireOne(tenantId, booking.id, now),
    );
    return outcomes.filter(Boolean).length;
  }

  // Approve, reject, cancel and a customer's answer to an information request all change the
  // booking (and take the resource locks first, docs/28-LOCK_CATALOG.md): reloading it inside the
  // transaction and saving it through the optimistic version check makes exactly one of them win.
  // A loser is a skip, which is the outcome the job wanted anyway; any other failure is retried.
  private async expireOne(tenantId: string, bookingId: string, now: Date): Promise<boolean> {
    try {
      return await this.txManager.run(async () => {
        const booking = await this.bookingRepo.findById(bookingId, tenantId);
        if (!booking || !(await this.isStillExpired(booking, now))) return false;
        const correlationId = uuidv7();
        booking.expireApproval(correlationId);
        await saveTerminalBookingsInTransaction(this.closingDeps, {
          tenantId,
          bookings: [booking],
          correlationId,
        });
        return true;
      });
    } catch (err) {
      if (err instanceof BookingConcurrentModificationError) return false;
      this.logger.error(
        'Failed to expire a booking hold — will retry on the next run',
        err instanceof Error ? err.stack : String(err),
        { tenantId, bookingId },
      );
      return false;
    }
  }

  private async isStillExpired(booking: Booking, now: Date): Promise<boolean> {
    if (booking.status !== BookingStatus.PENDING) return false;
    const rows = await this.occupancyRepo.findOccupancyByBookingLines(
      booking.tenantId,
      booking.lines.map((line) => line.lineId),
    );
    return rows.some(
      (row) =>
        row.lockState === 'HOLD' &&
        row.holdExpiresAt !== null &&
        row.holdExpiresAt.getTime() <= now.getTime(),
    );
  }
}
