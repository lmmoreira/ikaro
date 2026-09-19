import 'server-only';
import type { StaffServiceEditViewResponse, StaffServiceListResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { assertOk, FetchError } from '@/shared/lib/api/errors';

export class ServiceListFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(`Failed to fetch services (${status})`, status, code, field, detail);
    this.name = 'ServiceListFetchError';
  }
}

export async function fetchStaffServices(token: string): Promise<StaffServiceListResponse> {
  const res = await bffServerFetch(token, '/services');
  await assertOk(res, ServiceListFetchError);
  return res.json() as Promise<StaffServiceListResponse>;
}

export class ServiceEditViewFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(`Failed to fetch service edit view (${status})`, status, code, field, detail);
    this.name = 'ServiceEditViewFetchError';
  }
}

// One BFF call for the service + its intake schema (the BFF owns the fan-out, docs/24).
export async function fetchStaffServiceEditView(
  token: string,
  id: string,
): Promise<StaffServiceEditViewResponse> {
  const res = await bffServerFetch(token, `/services/${encodeURIComponent(id)}/edit-view`);
  await assertOk(res, ServiceEditViewFetchError);
  return res.json() as Promise<StaffServiceEditViewResponse>;
}
