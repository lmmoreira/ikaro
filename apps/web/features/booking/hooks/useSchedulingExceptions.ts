import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ResolveSchedulingExceptionsRequest } from '@ikaro/types';
import {
  countOpenSchedulingExceptions,
  listOpenSchedulingExceptions,
} from '@/features/booking/api/scheduling-exceptions';
import { resolveInBatches } from '@/features/booking/api/resolve-in-batches';
import { useTenant } from '@/providers/tenant-provider';

// The sidebar badge is read on every dashboard page, so it is cached for a minute.
export const OPEN_COUNT_STALE_TIME_MS = 60_000;

export function useOpenSchedulingExceptions() {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['scheduling-exceptions', tenantId, 'list'],
    queryFn: listOpenSchedulingExceptions,
  });
}

// MANAGER only: the route is manager-only on the BFF, so a STAFF user never fires the request.
export function useOpenSchedulingExceptionsCount() {
  const { tenantId, role } = useTenant();
  return useQuery({
    queryKey: ['scheduling-exceptions', tenantId, 'count'],
    queryFn: countOpenSchedulingExceptions,
    enabled: role === 'MANAGER',
    staleTime: OPEN_COUNT_STALE_TIME_MS,
  });
}

// A resolve can move or cancel bookings and change which resource they occupy, so it refreshes
// the worklist and its count plus the booking and day-grid caches (same set as a booking mutation).
export function useResolveSchedulingExceptions() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (request: ResolveSchedulingExceptionsRequest) => resolveInBatches(request),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['scheduling-exceptions', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['bookings', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['schedule', 'day-grid', tenantId] }),
      ]),
  });
}
