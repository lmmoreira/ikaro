import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { utcDateToLocalHHMM } from '../../../../shared/utils/calendar-date';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { MatchAvailabilityAlertsUseCase } from '../use-cases/match-availability-alerts.use-case';

// The local-morning window in which a tenant is swept — after BookingReminderJob's 06:00–06:29
// window. The cron-reminders trigger fires every 30 minutes, so exactly one tick lands inside it:
// once per tenant per day, with no "last run" state to store.
const WINDOW_START = '06:30';
const WINDOW_END = '06:59';

interface TenantSweepOutcome {
  tenantId: string;
  notified: number;
  failed: boolean;
}

export interface AvailabilityAlertSweepJobResult {
  tenantsSwept: number;
  notified: number;
}

// UC-072 step 3 (M23-S07), the slow path. Capacity can open with no booking event — the booking
// window rolls forward a day, a manager extends hours, adds an opening or a resource — so once a
// day each tenant's ACTIVE alerts are re-checked against real availability over the whole
// customer-selectable window. The matching and the single-notification rule are the use case's.
// One tenant failing never stops the others; after the last tenant the job throws if any failed, so
// the trigger handler nacks and the subscription retries (a re-run is a no-op for alerts already
// notified).
@Injectable()
export class AvailabilityAlertSweepJob {
  private readonly logger = new AppLogger(AvailabilityAlertSweepJob.name);

  constructor(
    @Inject(BOOKING_PLATFORM_PORT) private readonly tenantPort: IBookingPlatformPort,
    private readonly matchAlerts: MatchAvailabilityAlertsUseCase,
  ) {}

  async run(now: Date = new Date()): Promise<AvailabilityAlertSweepJobResult> {
    const tenants = await this.tenantPort.findAllActive();
    const due = tenants.filter((tenant) => {
      const localHHMM = utcDateToLocalHHMM(now, tenant.timezone);
      return localHHMM >= WINDOW_START && localHHMM <= WINDOW_END;
    });

    const outcomes = await mapSequentially(due, (tenant) => this.sweepTenant(tenant.id, now));
    const failed = outcomes.filter((outcome) => outcome.failed).map((outcome) => outcome.tenantId);
    // Every tenant has been swept by now, so one failure never starves the others. The failure itself
    // must still reach the subscription: a tenant is only swept inside its 06:30–06:59 window, so a
    // swallowed error would wait a whole day. Throwing nacks the message and Pub/Sub redelivers it —
    // still inside the window — and a re-run is a no-op for every alert already notified.
    if (failed.length > 0) {
      throw new Error(`Availability alert sweep failed for tenant(s): ${failed.join(', ')}`);
    }
    return {
      tenantsSwept: due.length,
      notified: outcomes.reduce((sum, outcome) => sum + outcome.notified, 0),
    };
  }

  private async sweepTenant(tenantId: string, now: Date): Promise<TenantSweepOutcome> {
    try {
      const { notified } = await this.matchAlerts.execute({
        tenantId,
        correlationId: uuidv7(),
        serviceIds: null,
        around: null,
        now,
      });
      return { tenantId, notified, failed: false };
    } catch (err) {
      this.logger.error(
        'Availability alert sweep failed for a tenant — the run will be retried',
        err instanceof Error ? err.stack : String(err),
        { tenantId },
      );
      return { tenantId, notified: 0, failed: true };
    }
  }
}
