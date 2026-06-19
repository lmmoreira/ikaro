import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deactivateStaff,
  getStaffMember,
  inviteStaff,
  listStaff,
  type InviteStaffRequest,
  type StaffListQuery,
} from '@/lib/api/dashboard/staff';
import { getTenantId } from '@/lib/api/bff-client';

export function useStaff(query?: StaffListQuery) {
  const tenantId = getTenantId();
  return useQuery({
    queryKey: ['staff', tenantId, query],
    queryFn: () => listStaff(query),
  });
}

export function useStaffMember(id: string) {
  const tenantId = getTenantId();
  return useQuery({
    queryKey: ['staff', tenantId, id],
    queryFn: () => getStaffMember(id),
    enabled: Boolean(id),
  });
}

export function useInviteStaff() {
  const queryClient = useQueryClient();
  const tenantId = getTenantId();
  return useMutation({
    mutationFn: (body: InviteStaffRequest) => inviteStaff(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', tenantId] }),
  });
}

export function useDeactivateStaff() {
  const queryClient = useQueryClient();
  const tenantId = getTenantId();
  return useMutation({
    mutationFn: (id: string) => deactivateStaff(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', tenantId] }),
  });
}
