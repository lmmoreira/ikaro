import { Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { localTimeWindow } from '../../../../shared/application/jobs/local-time-window';
import { TenantJobRunner } from '../../../../shared/application/jobs/tenant-job-runner';
import { MatchAvailabilityAlertsUseCase } from '../use-cases/match-availability-alerts.use-case';
import { ALERT_SWEEP_WINDOW } from './tenant-local-window.helpers';

// The local-morning window in which a tenant is swept — after BookingReminderJob's 06:00–06:29
// window. The cron-reminders trigger fires every 30 minutes, so exactly one tick lands inside it:
// once per tenant per day, with no "last run" state to store.

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
  constructor(
    private readonly tenantRunner: TenantJobRunner,
    private readonly matchAlerts: MatchAvailabilityAlertsUseCase,
  ) {}

  // A tenant is only swept inside its 06:30–06:59 window, so a swallowed error would wait a whole
  // day: the runner throws after every tenant was tried, the trigger handler nacks and Pub/Sub
  // redelivers the message, still inside the window.
  async run(now: Date = new Date()): Promise<AvailabilityAlertSweepJobResult> {
    const notified = await this.tenantRunner.forEachTenant(
      {
        label: 'Availability alert sweep',
        requires: 'BOOKING',
        isDue: localTimeWindow(ALERT_SWEEP_WINDOW),
      },
      now,
      (tenant) => this.sweepTenant(tenant.id, now),
    );
    return {
      tenantsSwept: notified.length,
      notified: notified.reduce((sum, count) => sum + count, 0),
    };
  }

  private async sweepTenant(tenantId: string, now: Date): Promise<number> {
    const { notified } = await this.matchAlerts.execute({
      tenantId,
      correlationId: uuidv7(),
      serviceIds: null,
      around: null,
      now,
    });
    return notified;
  }
}
