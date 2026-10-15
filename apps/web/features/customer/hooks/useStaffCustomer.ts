import { useQuery } from '@tanstack/react-query';
import { getCustomerById } from '@/features/customer/api';
import { useTenant } from '@/providers/tenant-provider';

/**
 * A customer as staff read them (`GET /customers/:customerId`, STAFF|MANAGER) — the recurring
 * request cards and the approval screen name the customer from this, because the schedule read
 * carries only `customerId`. Cached per customer, so several cards of one customer share a request.
 */
export function useStaffCustomer(customerId: string | undefined) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['customers', tenantId, 'detail', customerId],
    queryFn: () => getCustomerById(customerId as string),
    enabled: Boolean(customerId),
  });
}
