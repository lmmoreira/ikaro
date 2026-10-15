import type {
  ResolveSchedulingExceptionsRequest,
  SchedulingExceptionBulkResultResponse,
  SchedulingExceptionCountResponse,
  SchedulingExceptionListResponse,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

// UC-073/UC-077 — the manager's "Reservas a resolver" worklist. The BFF route is
// /scheduling-exceptions (the code/route term; "exceção" is never shown to the user).

export async function listOpenSchedulingExceptions(): Promise<SchedulingExceptionListResponse> {
  const res = await bffClient.get<SchedulingExceptionListResponse>('/scheduling-exceptions', {
    params: { status: 'OPEN' },
  });
  return res.data;
}

// M23-S46 — the open entries of ONE booking, with their alternatives: what the booking detail's
// decision panel needs, without loading and recomputing the whole worklist.
export async function listOpenSchedulingExceptionsForBooking(
  bookingId: string,
): Promise<SchedulingExceptionListResponse> {
  const res = await bffClient.get<SchedulingExceptionListResponse>(
    `/scheduling-exceptions/by-booking/${bookingId}`,
  );
  return res.data;
}

// The sidebar badge — a count query on the backend, never the list.
export async function countOpenSchedulingExceptions(): Promise<number> {
  const res = await bffClient.get<SchedulingExceptionCountResponse>('/scheduling-exceptions/count');
  return res.data.count;
}

// Best-effort per entry: a 200 whose `results` says which entries were resolved and which stayed
// open (with the reason as `errorCode`). One request takes at most 100 ids — see resolveInBatches().
export async function resolveSchedulingExceptions(
  body: ResolveSchedulingExceptionsRequest,
): Promise<SchedulingExceptionBulkResultResponse> {
  const res = await bffClient.post<SchedulingExceptionBulkResultResponse>(
    '/scheduling-exceptions/resolve',
    body,
  );
  return res.data;
}
