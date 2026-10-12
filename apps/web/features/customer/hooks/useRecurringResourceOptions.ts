import { useQuery } from '@tanstack/react-query';
import { fetchServiceResourceOptions } from '@/features/booking/api/public';

/**
 * The resource options of a service's `CUSTOMER_CHOICE` requirements, one entry per requirement in
 * the service's order (a bundle has several). The form and the review step both read it; React
 * Query shares the one request between them. A flat service has no leg index, so only entries
 * without one are kept.
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
    select: (response) => response.requirements.filter((entry) => entry.legIndex === null),
  });
}
