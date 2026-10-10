import { useQuery } from '@tanstack/react-query';
import { fetchServiceResourceOptions } from '@/features/booking/api/public';

/**
 * The resources a customer may pick for a `CUSTOMER_CHOICE` service's single requirement. The form
 * and the review step both read it; React Query shares the one request between them.
 */
export function useRecurringResourceOptions(
  tenantSlug: string,
  serviceId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['public', 'resource-options', tenantSlug, serviceId],
    queryFn: () => fetchServiceResourceOptions(tenantSlug, serviceId),
    enabled,
    select: (response) => response.requirements[0]?.options ?? [],
  });
}
