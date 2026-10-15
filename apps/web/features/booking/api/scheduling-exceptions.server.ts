import 'server-only';
import type { SchedulingExceptionItem, SchedulingExceptionListResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';

// GET /scheduling-exceptions?status=OPEN — the reschedule route's server page looks its entry up
// here (there is no by-id read: the open worklist is small and the route needs the booking id,
// which only the entry carries).
export async function fetchOpenSchedulingExceptions(
  token: string,
): Promise<SchedulingExceptionListResponse> {
  const res = await bffServerFetch(token, '/scheduling-exceptions?status=OPEN');
  if (!res.ok) throw new Error(`Failed to fetch scheduling exceptions (${res.status})`);
  return res.json() as Promise<SchedulingExceptionListResponse>;
}

export async function findOpenSchedulingException(
  token: string,
  exceptionId: string,
): Promise<SchedulingExceptionItem | null> {
  const { items } = await fetchOpenSchedulingExceptions(token);
  return items.find((i) => i.id === exceptionId) ?? null;
}
