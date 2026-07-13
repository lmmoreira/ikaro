import 'server-only';
import type { StaffServiceListResponse, StaffServiceResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { FetchError, parseErrorBody } from '@/shared/lib/api/errors';

export class ServiceListFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(status, code, field, detail ?? `Failed to fetch services (${status})`);
    this.name = 'ServiceListFetchError';
  }
}

export async function fetchStaffServices(token: string): Promise<StaffServiceListResponse> {
  const res = await bffServerFetch(token, '/services');
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new ServiceListFetchError(res.status, body.code, body.field, body.detail);
  }
  return res.json() as Promise<StaffServiceListResponse>;
}

export class ServiceDetailFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(status, code, field, detail ?? `Failed to fetch service detail (${status})`);
    this.name = 'ServiceDetailFetchError';
  }
}

export async function fetchStaffService(token: string, id: string): Promise<StaffServiceResponse> {
  const res = await bffServerFetch(token, `/services/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new ServiceDetailFetchError(res.status, body.code, body.field, body.detail);
  }
  return res.json() as Promise<StaffServiceResponse>;
}
