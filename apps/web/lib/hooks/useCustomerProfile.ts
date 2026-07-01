import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCustomerProfile,
  updateCustomerProfile,
  type UpdateCustomerProfileRequest,
} from '@/lib/api/customer';
import { useTenant } from '@/providers/tenant-provider';

export function useCustomerProfile() {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['customer', 'profile', tenantId],
    queryFn: getCustomerProfile,
  });
}

export function useUpdateCustomerProfile() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: UpdateCustomerProfileRequest) => updateCustomerProfile(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer', 'profile', tenantId] }),
  });
}
