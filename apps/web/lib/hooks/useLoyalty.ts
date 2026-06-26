import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCustomerLoyaltyBalance,
  getCustomerLoyaltyEntries,
  getCustomerLoyaltyRedemptions,
  getLoyaltyBalance,
  getLoyaltyEntries,
  getLoyaltyRedemptions,
  redeemPoints,
  type LoyaltyPaginationQuery,
  type RedeemPointsRequest,
} from '@/lib/api/dashboard/loyalty';
import { useTenant } from '@/providers/tenant-provider';

export function useLoyaltyBalance() {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['loyalty', 'balance', tenantId],
    queryFn: getLoyaltyBalance,
  });
}

export function useLoyaltyEntries(query?: LoyaltyPaginationQuery) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['loyalty', 'entries', tenantId, query],
    queryFn: () => getLoyaltyEntries(query),
  });
}

export function useLoyaltyRedemptions(query?: LoyaltyPaginationQuery) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['loyalty', 'redemptions', tenantId, query],
    queryFn: () => getLoyaltyRedemptions(query),
  });
}

export function useCustomerLoyaltyBalance(customerId: string) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['loyalty', 'balance', tenantId, customerId],
    queryFn: () => getCustomerLoyaltyBalance(customerId),
    enabled: Boolean(customerId),
  });
}

export function useCustomerLoyaltyEntries(customerId: string, query?: LoyaltyPaginationQuery) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['loyalty', 'entries', tenantId, customerId, query],
    queryFn: () => getCustomerLoyaltyEntries(customerId, query),
    enabled: Boolean(customerId),
  });
}

export function useCustomerLoyaltyRedemptions(customerId: string, query?: LoyaltyPaginationQuery) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['loyalty', 'redemptions', tenantId, customerId, query],
    queryFn: () => getCustomerLoyaltyRedemptions(customerId, query),
    enabled: Boolean(customerId),
  });
}

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
