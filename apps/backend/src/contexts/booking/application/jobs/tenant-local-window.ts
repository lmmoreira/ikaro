import { AppLogger } from '../../../../shared/observability/app-logger';
import { utcDateToLocalHHMM } from '../../../../shared/utils/calendar-date';
import { mapSequentially } from '../../../../shared/utils/sequential';

// The cron fires every 30 minutes (`*/30 * * * *`), so each 30-minute window below contains exactly
// one tick a day for a tenant. Two jobs must never share a window by accident: the reminders and
// the availability-alert sweep each get their own half hour of the tenant's morning.
export interface LocalTimeWindow {
  readonly start: string;
  readonly end: string;
}

export const REMINDER_WINDOW: LocalTimeWindow = { start: '06:00', end: '06:29' };
export const ALERT_SWEEP_WINDOW: LocalTimeWindow = { start: '06:30', end: '06:59' };

export function isInLocalWindow(now: Date, timezone: string, window: LocalTimeWindow): boolean {
  const localHHMM = utcDateToLocalHHMM(now, timezone);
  return localHHMM >= window.start && localHHMM <= window.end;
}

// Runs `work` for every tenant that is inside its local window, one after another. A failure never
// stops the tenants after it, but it is not swallowed either: with one tick a day inside the window,
// a logged-and-ignored error would cost that tenant the whole day. So the failures are collected and
// the run throws once at the end, which nacks the trigger message and lets Pub/Sub redeliver it.
// The re-run checks the window against the clock at redelivery, so a redelivery that arrives after
// the window has closed skips the failed tenant: this makes a retry possible, not guaranteed. A
// re-run is safe because the Commands the jobs publish carry deterministic dedup keys
// (docs/ENGINEERING_RULES_BACKEND.md § Adding a cron-published event).
export async function forEachTenantInWindow<T extends { id: string; timezone: string }>(
  tenants: readonly T[],
  now: Date,
  window: LocalTimeWindow,
  options: { logger: AppLogger; label: string },
  work: (tenant: T) => Promise<void>,
): Promise<void> {
  const due = tenants.filter((tenant) => isInLocalWindow(now, tenant.timezone, window));
  const outcomes = await mapSequentially(due, async (tenant) => {
    try {
      await work(tenant);
      return null;
    } catch (err) {
      options.logger.error(
        `${options.label} failed for a tenant — the run will be retried`,
        err instanceof Error ? err.stack : String(err),
        { tenantId: tenant.id },
      );
      return tenant.id;
    }
  });
  const failed = outcomes.filter((tenantId): tenantId is string => tenantId !== null);
  if (failed.length > 0) {
    throw new Error(`${options.label} failed for tenant(s): ${failed.join(', ')}`);
  }
}

export interface WindowedTenant {
  id: string;
  timezone: string;
}

// The shape every per-tenant, local-time-window cron job shares: list the tenants, run the work for
// each one that is inside its window, and fail the run after every tenant was tried (see
// forEachTenantInWindow). A job supplies only what differs: its window, its log label, where its
// tenants come from and what it does for one tenant.
export abstract class WindowedTenantJob {
  protected readonly logger = new AppLogger(this.constructor.name);

  protected abstract readonly window: LocalTimeWindow;
  protected abstract readonly label: string;
  protected abstract findTenants(): Promise<WindowedTenant[]>;
  protected abstract processTenant(tenant: WindowedTenant, now: Date): Promise<void>;

  async run(now: Date = new Date()): Promise<void> {
    const tenants = await this.findTenants();
    await forEachTenantInWindow(
      tenants,
      now,
      this.window,
      { logger: this.logger, label: this.label },
      (tenant) => this.processTenant(tenant, now),
    );
  }
}
