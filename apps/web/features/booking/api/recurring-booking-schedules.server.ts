import { notFound, redirect } from 'next/navigation';
import type {
  RecurringBookingScheduleListItem,
  RecurringBookingScheduleListResponse,
} from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { assertOk, CustomerFetchError } from '@/shared/lib/api/errors';

// The BFF caps `limit` at 100 and the customer's own schedules are bounded by MAX_ACTIVE_*, so one
// request holds every schedule the account page lists — there is no paging UI on that list.
const CUSTOMER_SCHEDULES_LIMIT = 100;

export async function fetchCustomerRecurringSchedules(
  token: string,
): Promise<RecurringBookingScheduleListResponse> {
  const query = new URLSearchParams({ limit: String(CUSTOMER_SCHEDULES_LIMIT) });
  const res = await bffServerFetch(token, `/recurring-booking-schedules?${query}`);
  await assertOk(res, CustomerFetchError);
  return res.json() as Promise<RecurringBookingScheduleListResponse>;
}

export interface RecurringSummary {
  /** The customer has a recurring schedule in any status (an ended one counts). */
  readonly hasAny: boolean;
  readonly activeCount: number;
}

/**
 * The Agendamentos tab's "Reservas recorrentes" entry row. Optional by design, so a failed read
 * resolves to `null` (no row) and the tab itself never breaks on a schedules read.
 */
export async function fetchRecurringSummary(token: string): Promise<RecurringSummary | null> {
  try {
    const { items } = await fetchCustomerRecurringSchedules(token);
    return {
      hasAny: items.length > 0,
      activeCount: items.filter((schedule) => schedule.status === 'ACTIVE').length,
    };
  } catch {
    return null;
  }
}

async function fetchCustomerRecurringSchedule(
  token: string,
  scheduleId: string,
): Promise<RecurringBookingScheduleListItem> {
  const res = await bffServerFetch(token, `/recurring-booking-schedules/${scheduleId}`);
  await assertOk(res, CustomerFetchError);
  return res.json() as Promise<RecurringBookingScheduleListItem>;
}

/**
 * The pre-fill source of a renewal link: the customer's own schedule, or null when the id is
 * unknown or not theirs (a `404` never says which) so the caller can fall back to the blank form.
 * A session that no longer authenticates this customer still goes to the login.
 */
export async function fetchCustomerRecurringScheduleOrNull(
  token: string,
  scheduleId: string,
  tenantSlug: string,
): Promise<RecurringBookingScheduleListItem | null> {
  try {
    return await fetchCustomerRecurringSchedule(token, scheduleId);
  } catch (err) {
    if (err instanceof CustomerFetchError) {
      if (err.status === 404) return null;
      if (err.status === 401 || err.status === 403) redirect(`/${tenantSlug}/login`);
    }
    throw err;
  }
}

// Used by every recurring-schedules/[id]/** route. 404 means the schedule does not exist or
// belongs to another customer/tenant (a read never reveals which); 401/403 means the session no
// longer authenticates this customer at this tenant.
export async function fetchCustomerRecurringScheduleOrRedirect(
  token: string,
  scheduleId: string,
  tenantSlug: string,
): Promise<RecurringBookingScheduleListItem> {
  try {
    return await fetchCustomerRecurringSchedule(token, scheduleId);
  } catch (err) {
    if (err instanceof CustomerFetchError) {
      if (err.status === 404) notFound();
      if (err.status === 401 || err.status === 403) redirect(`/${tenantSlug}/login`);
    }
    throw err;
  }
}
