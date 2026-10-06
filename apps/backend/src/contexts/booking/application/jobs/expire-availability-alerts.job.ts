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
  purged: number;
}

// How long a finished alert (EXPIRED, CANCELLED, NOTIFIED) stays visible as read-only history
// after its expiresAt before the same job deletes it (decided at M23-S06's PR review, 2026-10-05).
// A cancelled alert keeps its original expiresAt, so it lingers until then plus this window — at
// most the 365-day maximum lifetime plus 90 days.
export const AVAILABILITY_ALERT_RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;

interface TenantPassResult {
  expired: number;
  purged: number;
}

// UC-072 A2 / UC-076: an ACTIVE alert whose expiresAt has passed becomes EXPIRED without any
// manual step, and a finished alert older than the retention window is deleted. One pass over
// the tenants; each alert changes in its own transaction, so one failure never blocks the rest —
// a failure is logged and the next run retries it. expiresAt is an absolute instant, so "now"
// needs no per-tenant timezone; every query is tenant-scoped.
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
    return {
      expired: perTenant.reduce((sum, result) => sum + result.expired, 0),
      purged: perTenant.reduce((sum, result) => sum + result.purged, 0),
    };
  }

  private async processTenant(tenantId: string, now: Date): Promise<TenantPassResult> {
    const correlationId = uuidv7();
    const due = await this.alertRepo.findActiveExpired(tenantId, now);
    // One after another: run side by side they would each hold a pooled connection, and a
    // backlog across tenants could exhaust the pool (shared/utils/sequential.ts).
    const outcomes = await mapSequentially(due, (alert) => this.expireOne(alert, correlationId));
    const purged = await this.purgeFinished(tenantId, now);
    return { expired: outcomes.filter(Boolean).length, purged };
  }

  // Runs after the expiry step and only ever deletes alerts that are no longer ACTIVE, so an alert
  // that expired in this pass is deleted in it only if its expiresAt is already older than the
  // retention window (the job was down for longer than that). A failure is logged and retried on
  // the next run, and never blocks the other tenants.
  private async purgeFinished(tenantId: string, now: Date): Promise<number> {
    try {
      const cutoff = new Date(now.getTime() - AVAILABILITY_ALERT_RETENTION_DAYS * DAY_MS);
      return await this.alertRepo.deleteFinishedExpiredBefore(tenantId, cutoff);
    } catch (err) {
      this.logger.error(
        'Failed to purge finished availability alerts — will retry on the next run',
        err instanceof Error ? err.stack : String(err),
        { tenantId },
      );
      return 0;
    }
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
