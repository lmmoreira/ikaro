import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateResourceRequest, UpdateResourceRequest } from '@ikaro/types';
import {
  createResource,
  deactivateResource,
  getResource,
  listResources,
  reactivateResource,
  updateResource,
  type ListResourcesQuery,
} from '@/features/booking/api/resources';
import { useTenant } from '@/providers/tenant-provider';

export function useResources(query?: ListResourcesQuery) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['resources', tenantId, query],
    queryFn: () => listResources(query),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resources', tenantId] }),
  });
}

export function useReactivateResource() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (id: string) => reactivateResource(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resources', tenantId] }),
  });
}
