import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { StaffServiceEditViewResponse, StaffServiceResponse } from '@ikaro/types';
import {
  fetchStaffService,
  fetchStaffServiceEditView,
  ServiceDetailFetchError,
  ServiceEditViewFetchError,
} from '@/features/booking/api/services.server';

export interface ServiceDetailRouteData {
  readonly service: StaffServiceResponse;
}

// Service-only load — the layout on non-edit routes and the deactivate page need `isActive`/name,
// never the intake schema, so they must not pay for it.
export const loadServiceDetailRouteData = cache(async function loadServiceDetailRouteData(
  token: string,
  serviceId: string,
): Promise<ServiceDetailRouteData> {
  try {
    return { service: await fetchStaffService(token, serviceId) };
  } catch (err) {
    if (err instanceof ServiceDetailFetchError && err.status === 404) {
      notFound();
    }
    throw err;
  }
});

// Edit page: service + intake schema from ONE BFF composite call (the BFF owns the fan-out,
// docs/24). `cache()` dedupes the layout's and the page's calls for the same request.
export const loadServiceEditRouteData = cache(async function loadServiceEditRouteData(
  token: string,
  serviceId: string,
): Promise<StaffServiceEditViewResponse> {
  try {
    return await fetchStaffServiceEditView(token, serviceId);
  } catch (err) {
    if (err instanceof ServiceEditViewFetchError && err.status === 404) {
      notFound();
    }
    throw err;
  }
});
