import type { AvailabilityAlertResponse } from '@ikaro/types';

/**
 * A cancelled alert is gone for the customer ("O aviso deixa de existir"), so neither the alerts
 * list nor the Agendamentos entry row shows it; the server keeps it for 90 days like any finished
 * alert.
 */
export function isVisibleAlert(alert: Pick<AvailabilityAlertResponse, 'status'>): boolean {
  return alert.status !== 'CANCELLED';
}
