import 'server-only';
import type {
  StaffServiceEditViewResponse,
  StaffServiceListResponse,
  StaffServiceResponse,
} from '@ikaro/types';
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

export class ServiceDetailFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(`Failed to fetch service detail (${status})`, status, code, field, detail);
    this.name = 'ServiceDetailFetchError';
  }
}

// Service-only read — for routes that never render the intake schema (the layout on non-edit
// routes, the deactivate page). The edit page uses fetchStaffServiceEditView instead.
export async function fetchStaffService(token: string, id: string): Promise<StaffServiceResponse> {
  const res = await bffServerFetch(token, `/services/${encodeURIComponent(id)}`);
  await assertOk(res, ServiceDetailFetchError);
  return res.json() as Promise<StaffServiceResponse>;
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
