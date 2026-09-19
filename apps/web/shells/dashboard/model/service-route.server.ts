import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { StaffServiceEditViewResponse } from '@ikaro/types';
import {
  fetchStaffServiceEditView,
  ServiceEditViewFetchError,
} from '@/features/booking/api/services.server';

export type ServiceDetailRouteData = StaffServiceEditViewResponse;

export const loadServiceDetailRouteData = cache(async function loadServiceDetailRouteData(
  token: string,
  serviceId: string,
): Promise<ServiceDetailRouteData> {
  try {
    return await fetchStaffServiceEditView(token, serviceId);
  } catch (err) {
    if (err instanceof ServiceEditViewFetchError && err.status === 404) {
      notFound();
    }
    throw err;
  }
});
