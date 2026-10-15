import type {
  ApproveRecurringBookingScheduleResponse,
  CreateRecurringBookingScheduleRequest,
  CreateRecurringBookingScheduleResponse,
  RecurringBookingScheduleListItem,
  RecurringBookingScheduleListResponse,
  RejectRecurringBookingScheduleResponse,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

// The BFF caps `limit` at 100. A pending request holds a 30-minute approval slot and then expires,
// so the queue is short and one page covers any real tenant.
const PENDING_SCHEDULES_PAGE_SIZE = 100;
// Circuit breaker against a runaway loop (a corrupted `hasMore`), at 5,000 requests, far beyond any
// real queue. Hitting it throws rather than returning a shorter list: a queue that silently omits
// requests is worse than one that fails visibly (the same rule as `listAllPages` for bookings).
const PENDING_SCHEDULES_MAX_PAGES = 50;

// UC-070 — the signed-in customer requests a recurring schedule for themself (the customer id
// comes from the JWT, never the body). 201 → ACTIVE, or PENDING_APPROVAL with the hold's end.
export async function createRecurringScheduleAsCustomer(
  body: CreateRecurringBookingScheduleRequest,
): Promise<CreateRecurringBookingScheduleResponse> {
  const res = await bffClient.post<CreateRecurringBookingScheduleResponse>(
    '/recurring-booking-schedules',
    body,
  );
  return res.data;
}

// UC-070 A2 — 200 → the schedule becomes CANCELLED and its future occurrence bookings are
// cancelled (past ones are kept). Body-less; the schedule id is the only input.
export async function endRecurringScheduleAsCustomer(scheduleId: string): Promise<void> {
  await bffClient.post(`/recurring-booking-schedules/${scheduleId}/end`);
}

// UC-071 — every request waiting for a staff decision, newest first, all pages. Asked for by status
// on the server (never filtered client-side), so the queue's pending requests are exactly the ones
// the backend holds. Follows `pagination.hasMore` to the end, sequentially (one page is the norm).
export async function listPendingRecurringSchedules(): Promise<RecurringBookingScheduleListItem[]> {
  const items: RecurringBookingScheduleListItem[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < PENDING_SCHEDULES_MAX_PAGES; page += 1) {
    const res = await bffClient.get<RecurringBookingScheduleListResponse>(
      '/recurring-booking-schedules',
      {
        params: {
          status: 'PENDING_APPROVAL',
          limit: PENDING_SCHEDULES_PAGE_SIZE,
          offset: page * PENDING_SCHEDULES_PAGE_SIZE,
        },
      },
    );
    let added = 0;
    for (const item of res.data.items) {
      // Offset paging over a live table can repeat a row if one is created between two requests.
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
        added += 1;
      }
    }
    // Done when the server says so, or when a page brings nothing new (an empty page, or one that
    // only repeats rows already read), so a `hasMore` that never clears cannot loop.
    if (!res.data.pagination.hasMore || added === 0) return items;
  }

  throw new Error(
    `listPendingRecurringSchedules: exceeded ${PENDING_SCHEDULES_MAX_PAGES} pages — refusing to return a silently truncated queue`,
  );
}

// UC-071 — one schedule in the list-item shape, whatever its status (STAFF|MANAGER read any in the
// tenant); the approval screen shows a pending one with actions and any other read-only.
export async function getRecurringSchedule(
  scheduleId: string,
): Promise<RecurringBookingScheduleListItem> {
  const res = await bffClient.get<RecurringBookingScheduleListItem>(
    `/recurring-booking-schedules/${scheduleId}`,
  );
  return res.data;
}

// UC-071 — approving creates every occurrence of the term at once (or refuses it whole with a 409
// conflicts list). Body-less; the response carries how many were created.
export async function approveRecurringScheduleAsStaff(
  scheduleId: string,
): Promise<ApproveRecurringBookingScheduleResponse> {
  const res = await bffClient.post<ApproveRecurringBookingScheduleResponse>(
    `/recurring-booking-schedules/${scheduleId}/approve`,
  );
  return res.data;
}

// UC-071 — rejecting creates nothing and takes no reason (the endpoint has no body).
export async function rejectRecurringScheduleAsStaff(
  scheduleId: string,
): Promise<RejectRecurringBookingScheduleResponse> {
  const res = await bffClient.post<RejectRecurringBookingScheduleResponse>(
    `/recurring-booking-schedules/${scheduleId}/reject`,
  );
  return res.data;
}
