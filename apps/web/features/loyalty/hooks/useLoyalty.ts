import { useMutation, useQueryClient } from '@tanstack/react-query';
import { redeemPoints, type RedeemPointsRequest } from '@/features/loyalty/api';
import { useTenant } from '@/providers/tenant-provider';

export function useRedeemPoints() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: RedeemPointsRequest) => redeemPoints(body),
    onSuccess: () =>
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'loyalty' && query.queryKey[2] === tenantId,
      }),
  });
}
