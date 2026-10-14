import { notFound, redirect } from 'next/navigation';
import type { AvailabilityAlertListResponse, AvailabilityAlertResponse } from '@ikaro/types';
import { isVisibleAlert } from '@/features/booking/model/availability-alert-status';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { assertOk, CustomerFetchError } from '@/shared/lib/api/errors';

// GET /availability-alerts — the caller's own alerts, newest first, history included, at most the
// 100 most recent (UC-076). One request holds everything the list page shows.
export async function fetchCustomerAvailabilityAlerts(
  token: string,
): Promise<AvailabilityAlertListResponse> {
  const res = await bffServerFetch(token, '/availability-alerts');
  await assertOk(res, CustomerFetchError);
  return res.json() as Promise<AvailabilityAlertListResponse>;
}

export interface AlertsSummary {
  /** The customer has an alert the list shows (a cancelled one does not count). */
  readonly hasAny: boolean;
  readonly activeCount: number;
}

/**
 * The Agendamentos tab's "Meus avisos" entry row. Optional by design, so a failed read resolves to
 * `null` (no row) and the tab itself never breaks on an alerts read.
 */
export async function fetchAlertsSummary(token: string): Promise<AlertsSummary | null> {
  try {
    const { items } = await fetchCustomerAvailabilityAlerts(token);
    return {
      hasAny: items.some(isVisibleAlert),
      activeCount: items.filter((alert) => alert.status === 'ACTIVE').length,
    };
  } catch {
    return null;
  }
}

// Used by every alerts/[id]/** route. 404 means the alert does not exist, was purged, or belongs to
// another customer/tenant (a read never reveals which); 401/403 means the session no longer
// authenticates this customer at this tenant.
export async function fetchCustomerAvailabilityAlertOrRedirect(
  token: string,
  alertId: string,
  tenantSlug: string,
): Promise<AvailabilityAlertResponse> {
  try {
    const res = await bffServerFetch(token, `/availability-alerts/${alertId}`);
    await assertOk(res, CustomerFetchError);
    const alert = (await res.json()) as AvailabilityAlertResponse;
    // A cancelled alert no longer exists for the customer.
    if (!isVisibleAlert(alert)) notFound();
    return alert;
  } catch (err) {
    if (err instanceof CustomerFetchError) {
      if (err.status === 404) notFound();
      if (err.status === 401 || err.status === 403) redirect(`/${tenantSlug}/login`);
    }
    throw err;
  }
}
