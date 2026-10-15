import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateResourceRequest, UpdateResourceRequest } from '@ikaro/types';
import {
  createResource,
  deactivateResource,
  getResource,
  getResourceStaffOptions,
  listResources,
  reactivateResource,
  updateResource,
  type ListResourcesQuery,
} from '@/features/booking/api/resources';
import { useTenant } from '@/providers/tenant-provider';

export function useResources(query?: ListResourcesQuery, options?: { readonly enabled?: boolean }) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['resources', tenantId, query],
    queryFn: () => listResources(query),
    enabled: options?.enabled ?? true,
  });
}

export function useResource(id: string) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['resources', tenantId, id],
    queryFn: () => getResource(id),
    enabled: Boolean(id),
  });
}

export function useResourceStaffOptions(excludeResourceId?: string) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['resources', tenantId, 'staff-options', excludeResourceId],
    queryFn: () => getResourceStaffOptions(excludeResourceId),
  });
}

export function useCreateResource() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: CreateResourceRequest) => createResource(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resources', tenantId] }),
  });
}

export function useUpdateResource() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateResourceRequest }) =>
      updateResource(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resources', tenantId] }),
  });
}

export function useDeactivateResource() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (id: string) => deactivateResource(id),
    // Deactivating a resource raises one "Reservas a resolver" entry per future booking on it, in
    // the same request, so the worklist and its sidebar badge are stale from this moment on.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['resources', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['scheduling-exceptions', tenantId] }),
      ]),
  });
}

export function useReactivateResource() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (id: string) => reactivateResource(id),
    // Reactivating a resource closes its open "Reservas a resolver" entries in the same request
    // (M23-S45), so the worklist and its sidebar badge are stale from this moment on.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['resources', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['scheduling-exceptions', tenantId] }),
      ]),
  });
}
