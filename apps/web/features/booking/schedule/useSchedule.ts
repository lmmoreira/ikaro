import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  ScheduleClosureListResponse,
  ScheduleOpeningListResponse,
  StaffBookingListResponse,
} from '@ikaro/types';
import {
  createClosure,
  createOpening,
  getScheduleDayGrid,
  listClosures,
  listOpenings,
  removeClosure,
  removeOpening,
  type CreateClosureRequest,
  type CreateOpeningRequest,
} from '@/features/booking/api/schedule';
import { listBookings } from '@/features/booking/api/booking';
import { SCHEDULE_BOOKING_STATUS_ALL } from '@/features/booking/model/booking-status';
import { useTenant } from '@/providers/tenant-provider';

// The backend's resourceId filter is exact (WHERE resourceId = :id OR IS NULL for the tenant-wide
// scope, never both at once — see typeorm-schedule-closure/opening.repository.ts), so a
// resource-scoped GET never includes the tenant-wide rows. De-duplicate by id once every scope's
// results are merged, since more than one selected resource can each still surface the same item
// were the filter ever to change shape.
function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) seen.set(item.id, item);
  return [...seen.values()];
}

// Zero resourceIds selected = today's tenant-wide-only query (a single scope of `undefined`).
// One or more selected = the tenant-wide scope plus one parallel query per resource — a
// tenant-wide closure/opening always applies to every resource regardless of what's checked, so
// it must be fetched explicitly rather than assumed to ride along on a resource-scoped response.
function resolveScopes(resourceIds: readonly string[]): readonly (string | undefined)[] {
  return resourceIds.length === 0 ? [undefined] : [undefined, ...resourceIds];
}

// A failed scope must surface as an error, not silently resolve to "no items" — the caller
// (schedule-page-query-data.ts) would otherwise render an apparently valid empty schedule on a
// transient 401/403/5xx instead of an error state.
function mergeScopedQueries<T extends { id: string }>(
  queries: readonly UseQueryResult<{ items: readonly T[] }>[],
): { data?: { items: T[] }; isError: boolean; error: unknown } {
  const failed = queries.find((query) => query.isError);
  if (failed) return { isError: true, error: failed.error };

  const data = queries.every((query) => query.data !== undefined)
    ? { items: dedupeById(queries.flatMap((query) => query.data?.items ?? [])) }
    : undefined;
  return { data, isError: false, error: null };
}

export function useScheduleClosures(
  from: string,
  to: string,
  initialData?: ScheduleClosureListResponse,
  resourceIds: readonly string[] = [],
) {
  const { tenantId } = useTenant();
  const scopes = resolveScopes(resourceIds);
  const queries = useQueries({
    queries: scopes.map((resourceId) => ({
      queryKey: ['schedule', 'closures', tenantId, from, to, resourceId ?? null],
      queryFn: () => listClosures(from, to, resourceId),
      enabled: Boolean(from && to),
      // Only ever meaningfully set by the caller when resourceIds is empty (a single, tenant-wide
      // scope) — see schedule-page-query-data.ts's own isInitialTenantWideView gate.
      initialData,
    })),
  });

  return mergeScopedQueries(queries);
}

export function useCreateClosure() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: CreateClosureRequest) => createClosure(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['schedule', 'closures', tenantId] }),
  });
}

export function useRemoveClosure() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (id: string) => removeClosure(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['schedule', 'closures', tenantId] }),
  });
}

export function useScheduleOpenings(
  from: string,
  to: string,
  initialData?: ScheduleOpeningListResponse,
  resourceIds: readonly string[] = [],
) {
  const { tenantId } = useTenant();
  const scopes = resolveScopes(resourceIds);
  const queries = useQueries({
    queries: scopes.map((resourceId) => ({
      queryKey: ['schedule', 'openings', tenantId, from, to, resourceId ?? null],
      queryFn: () => listOpenings(from, to, resourceId),
      enabled: Boolean(from && to),
      initialData,
    })),
  });

  return mergeScopedQueries(queries);
}

export function useCreateOpening() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: CreateOpeningRequest) => createOpening(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['schedule', 'openings', tenantId] }),
  });
}

export function useRemoveOpening() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (id: string) => removeOpening(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['schedule', 'openings', tenantId] }),
  });
}

export function useWeekBookings(from: string, to: string, initialData?: StaffBookingListResponse) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['bookings', tenantId, 'week', from, to],
    queryFn: () => listBookings({ status: SCHEDULE_BOOKING_STATUS_ALL, from, to, limit: 100 }),
    enabled: Boolean(from && to),
    initialData,
  });
}

// The response doesn't vary by which resources are checked (it always covers every active
// resource for the date), so the query key never includes resourceIds — only `enabled` does.
// Never fetched for STAFF: resourceIds is always empty for STAFF, and the day-grid BFF route is
// itself MANAGER-only, so this simply never fires rather than hitting a 403.
export function useScheduleDayGrid(date: string, resourceIds: readonly string[]) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['schedule', 'day-grid', tenantId, date],
    queryFn: () => getScheduleDayGrid(date),
    enabled: Boolean(date) && resourceIds.length > 0,
  });
}
