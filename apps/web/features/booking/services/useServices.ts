import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateServiceRequest, UpdateServiceRequest } from '@ikaro/types';
import {
  activateService,
  createService,
  deactivateService,
  listServices,
  updateService,
} from '@/features/booking/api/services';
import { useTenant } from '@/providers/tenant-provider';

export function useServices() {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['services', tenantId],
    queryFn: listServices,
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: CreateServiceRequest) => createService(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', tenantId] }),
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateServiceRequest }) =>
      updateService(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', tenantId] }),
  });
}

export function useActivateService() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (id: string) => activateService(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', tenantId] }),
  });
}

export function useDeactivateService() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (id: string) => deactivateService(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', tenantId] }),
  });
}
