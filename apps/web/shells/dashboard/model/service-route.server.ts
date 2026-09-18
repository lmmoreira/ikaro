import { cache } from 'react';
import { notFound } from 'next/navigation';
import {
  fetchServiceIntakeSchema,
  fetchStaffService,
  ServiceDetailFetchError,
  ServiceIntakeSchemaFetchError,
} from '@/features/booking/api/services.server';

export interface ServiceDetailRouteData {
  readonly service: Awaited<ReturnType<typeof fetchStaffService>>;
  readonly intakeSchema: Awaited<ReturnType<typeof fetchServiceIntakeSchema>>;
}

export const loadServiceDetailRouteData = cache(async function loadServiceDetailRouteData(
  token: string,
  serviceId: string,
): Promise<ServiceDetailRouteData> {
  try {
    const [service, intakeSchema] = await Promise.all([
      fetchStaffService(token, serviceId),
      fetchServiceIntakeSchema(token, serviceId),
    ]);
    return { service, intakeSchema };
  } catch (err) {
    if (
      (err instanceof ServiceDetailFetchError || err instanceof ServiceIntakeSchemaFetchError) &&
      err.status === 404
    ) {
      notFound();
    }
    throw err;
  }
});
