import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateServiceRequest, UpdateServiceRequest } from '@ikaro/types';
import {
  createService,
  deactivateService,
  listServices,
  updateService,
} from '@/lib/api/dashboard/services';
import { getTenantId } from '@/lib/api/bff-client';

export function useServices() {
  const tenantId = getTenantId();
  return useQuery({
    queryKey: ['services', tenantId],
    queryFn: listServices,
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  const tenantId = getTenantId();
  return useMutation({
    mutationFn: (body: CreateServiceRequest) => createService(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', tenantId] }),
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  const tenantId = getTenantId();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateServiceRequest }) =>
      updateService(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', tenantId] }),
  });
}

export function useDeactivateService() {
  const queryClient = useQueryClient();
  const tenantId = getTenantId();
  return useMutation({
    mutationFn: (id: string) => deactivateService(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', tenantId] }),
  });
}
