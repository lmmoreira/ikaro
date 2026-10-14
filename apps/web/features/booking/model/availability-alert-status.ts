import type { AvailabilityAlertResponse } from '@ikaro/types';

/**
 * A cancelled alert is gone for the customer ("O aviso deixa de existir"), so neither the alerts
 * list nor the Agendamentos entry row shows it; the server keeps it for 90 days like any finished
 * alert.
 */
export function isVisibleAlert(alert: Pick<AvailabilityAlertResponse, 'status'>): boolean {
  return alert.status !== 'CANCELLED';
}

/**
 * The backend only flips an alert to EXPIRED when its sweep job runs, but it already refuses to
 * edit or cancel an ACTIVE alert whose `expiresAt` has passed. The customer views follow that
 * rule, so such an alert reads as expired (and offers no "Cancelar aviso") before the sweep.
 */
export function withEffectiveStatus(
  alert: AvailabilityAlertResponse,
  now: Date = new Date(),
): AvailabilityAlertResponse {
  if (alert.status === 'ACTIVE' && new Date(alert.expiresAt) <= now) {
    return { ...alert, status: 'EXPIRED' };
  }
  return alert;
}
