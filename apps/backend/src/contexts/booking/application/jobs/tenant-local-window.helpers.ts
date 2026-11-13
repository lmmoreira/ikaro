import type { LocalTimeWindow } from '../../../../shared/application/jobs/local-time-window';

// The cron fires every 30 minutes (`*/30 * * * *`), so each 30-minute window below contains exactly
// one tick a day for a tenant. Two jobs must never share a window by accident: the reminders and
// the availability-alert sweep each get their own half hour of the tenant's morning.
export const REMINDER_WINDOW: LocalTimeWindow = { start: '06:00', end: '06:29' };
export const ALERT_SWEEP_WINDOW: LocalTimeWindow = { start: '06:30', end: '06:59' };
