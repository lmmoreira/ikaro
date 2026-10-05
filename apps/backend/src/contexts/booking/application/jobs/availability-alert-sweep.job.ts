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

export interface AvailabilityAlertSweepJobResult {
  tenantsSwept: number;
  notified: number;
}

// UC-072 step 3 (M23-S07), the slow path. Capacity can open with no booking event — the booking
// window rolls forward a day, a manager extends hours, adds an opening or a resource — so once a
// day each tenant's ACTIVE alerts are re-checked against real availability over the whole
// customer-selectable window. The matching and the single-notification rule are the use case's.
// One tenant failing is logged and never stops the others; the trigger handler still nacks on an
// unexpected error so the subscription retries (a re-run is a no-op for alerts already notified).
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

    const counts = await mapSequentially(due, (tenant) => this.sweepTenant(tenant.id, now));
    return {
      tenantsSwept: due.length,
      notified: counts.reduce((sum, count) => sum + count, 0),
    };
  }

  private async sweepTenant(tenantId: string, now: Date): Promise<number> {
    try {
      const { notified } = await this.matchAlerts.execute({
        tenantId,
        correlationId: uuidv7(),
        serviceIds: null,
        around: null,
        now,
      });
      return notified;
    } catch (err) {
      this.logger.error(
        'Availability alert sweep failed for a tenant — will retry on the next run',
        err instanceof Error ? err.stack : String(err),
        { tenantId },
      );
      return 0;
    }
  }
}
