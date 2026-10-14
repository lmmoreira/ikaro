import type { AvailabilityAlertResponse, AvailabilityAlertStatus } from '@ikaro/types';
import { isVisibleAlert } from '@/features/booking/model/availability-alert-status';

export interface AlertSections {
  readonly active: AvailabilityAlertResponse[];
  readonly history: AvailabilityAlertResponse[];
}

/** The list is newest first from the API; both sections keep that order. */
export function splitAlertSections(items: readonly AvailabilityAlertResponse[]): AlertSections {
  const visible = items.filter(isVisibleAlert);
  return {
    active: visible.filter((alert) => alert.status === 'ACTIVE'),
    history: visible.filter((alert) => alert.status !== 'ACTIVE'),
  };
}

export const ALERT_STATUS_CLASSES: Partial<Record<AvailabilityAlertStatus, string>> = {
  ACTIVE: 'bg-green-100 text-green-800',
  NOTIFIED: 'bg-blue-100 text-blue-800',
  EXPIRED: 'bg-gray-100 text-gray-500',
};

export function alertListPath(tenantSlug: string): string {
  return `/${tenantSlug}/my-account/alerts`;
}

export function alertDetailPath(tenantSlug: string, alertId: string): string {
  return `${alertListPath(tenantSlug)}/${alertId}`;
}

export function alertCancelPath(tenantSlug: string, alertId: string): string {
  return `${alertDetailPath(tenantSlug, alertId)}/cancel`;
}

/** Only an ACTIVE alert can be cancelled; a notified or expired one is read-only history. */
export function canCancelAlert(status: AvailabilityAlertStatus): boolean {
  return status === 'ACTIVE';
}
