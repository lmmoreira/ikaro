import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createClosure,
  createOpening,
  listClosures,
  listOpenings,
  removeClosure,
  removeOpening,
  type CreateClosureRequest,
  type CreateOpeningRequest,
} from '@/features/booking/schedule/api';
import { useTenant } from '@/providers/tenant-provider';

export function useScheduleClosures(from: string, to: string) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['schedule', 'closures', tenantId, from, to],
    queryFn: () => listClosures(from, to),
    enabled: Boolean(from && to),
  });
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

export function useScheduleOpenings(from: string, to: string) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['schedule', 'openings', tenantId, from, to],
    queryFn: () => listOpenings(from, to),
    enabled: Boolean(from && to),
  });
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
