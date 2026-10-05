import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { AvailabilityAlert } from '../../domain/availability-alert.aggregate';
import { BookingConcurrentModificationError } from '../../domain/errors/booking-domain.error';
import {
  AVAILABILITY_ALERT_REPOSITORY,
  IAvailabilityAlertRepository,
} from '../ports/availability-alert-repository.port';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';

export interface ExpireAvailabilityAlertsJobResult {
  expired: number;
}

// UC-072 A2 / UC-076: an ACTIVE alert whose expiresAt has passed becomes EXPIRED without any
// manual step. One pass over the tenants; each alert changes in its own transaction, so one
// failure never blocks the rest — a failure is logged and the next run retries it. expiresAt is
// an absolute instant, so "now" needs no per-tenant timezone; the query is tenant-scoped.
@Injectable()
export class ExpireAvailabilityAlertsJob {
  private readonly logger = new AppLogger(ExpireAvailabilityAlertsJob.name);

  constructor(
    @Inject(BOOKING_PLATFORM_PORT) private readonly tenantPort: IBookingPlatformPort,
    @Inject(AVAILABILITY_ALERT_REPOSITORY)
    private readonly alertRepo: IAvailabilityAlertRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async run(now: Date = new Date()): Promise<ExpireAvailabilityAlertsJobResult> {
    const tenants = await this.tenantPort.findAllActive();
    const perTenant = await mapSequentially(tenants, (tenant) =>
      this.processTenant(tenant.id, now),
    );
    return { expired: perTenant.reduce((sum, count) => sum + count, 0) };
  }

  private async processTenant(tenantId: string, now: Date): Promise<number> {
    const correlationId = uuidv7();
    const due = await this.alertRepo.findActiveExpired(tenantId, now);
    // One after another: run side by side they would each hold a pooled connection, and a
    // backlog across tenants could exhaust the pool (shared/utils/sequential.ts).
    const outcomes = await mapSequentially(due, (alert) => this.expireOne(alert, correlationId));
    return outcomes.filter(Boolean).length;
  }

  // A version conflict means a customer's cancel (or a parallel run) got there first, which is
  // an outcome the job is fine with; any other failure is logged and retried on the next run.
  private async expireOne(alert: AvailabilityAlert, correlationId: string): Promise<boolean> {
    try {
      await this.txManager.run(async () => {
        alert.expire(correlationId);
        await this.alertRepo.save(alert);
      });
      return true;
    } catch (err) {
      if (err instanceof BookingConcurrentModificationError) return false;
      this.logger.error(
        'Failed to expire an availability alert — will retry on the next run',
        err instanceof Error ? err.stack : String(err),
        { tenantId: alert.tenantId, alertId: alert.id },
      );
      return false;
    }
  }
}
