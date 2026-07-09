import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InviteStaffRequest, UpdateStaffRequest } from '@ikaro/types';
import {
  activateStaff,
  deactivateStaff,
  getStaffMember,
  inviteStaff,
  listStaff,
  updateStaff,
  type StaffListQuery,
} from '@/features/staff/api/staff';
import { useTenant } from '@/providers/tenant-provider';

export function useStaff(query?: StaffListQuery) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['staff', tenantId, query],
    queryFn: () => listStaff(query),
  });
}

export function useStaffMember(id: string) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['staff', tenantId, id],
    queryFn: () => getStaffMember(id),
    enabled: Boolean(id),
  });
}

export function useInviteStaff() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: InviteStaffRequest) => inviteStaff(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', tenantId] }),
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateStaffRequest }) => updateStaff(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', tenantId] }),
  });
}

export function useDeactivateStaff() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (id: string) => deactivateStaff(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', tenantId] }),
  });
}

export function useActivateStaff() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (id: string) => activateStaff(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', tenantId] }),
  });
}
