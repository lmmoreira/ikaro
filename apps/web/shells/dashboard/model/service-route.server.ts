import { cache } from 'react';
import { notFound } from 'next/navigation';
import { ServiceDetailFetchError, fetchStaffService } from '@/features/booking/services/api';

export interface ServiceDetailRouteData {
  readonly service: Awaited<ReturnType<typeof fetchStaffService>>;
}

export const loadServiceDetailRouteData = cache(async function loadServiceDetailRouteData(
  token: string,
  serviceId: string,
): Promise<ServiceDetailRouteData> {
  try {
    const service = await fetchStaffService(token, serviceId);
    return { service };
  } catch (err) {
    if (err instanceof ServiceDetailFetchError && err.status === 404) {
      notFound();
    }
    throw err;
  }
});
