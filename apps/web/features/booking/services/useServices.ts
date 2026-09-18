import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateServiceRequest,
  PublishServiceIntakeSchemaRequest,
  UpdateServiceBookingPolicyRequest,
  UpdateServiceLegsRequest,
  UpdateServiceRequest,
  UpdateServiceResourceRequirementsRequest,
} from '@ikaro/types';
import {
  activateService,
  createService,
  deactivateService,
  listServices,
  publishServiceIntakeSchema,
  updateService,
  updateServiceBookingPolicy,
  updateServiceLegs,
  updateServiceResourceRequirements,
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

export function useUpdateServiceResourceRequirements() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateServiceResourceRequirementsRequest }) =>
      updateServiceResourceRequirements(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', tenantId] }),
  });
}

export function useUpdateServiceLegs() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateServiceLegsRequest }) =>
      updateServiceLegs(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', tenantId] }),
  });
}

export function useUpdateServiceBookingPolicy() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateServiceBookingPolicyRequest }) =>
      updateServiceBookingPolicy(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', tenantId] }),
  });
}

export function usePublishServiceIntakeSchema() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PublishServiceIntakeSchemaRequest }) =>
      publishServiceIntakeSchema(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', tenantId] }),
  });
}
