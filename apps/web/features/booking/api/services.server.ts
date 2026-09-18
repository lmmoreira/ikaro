import 'server-only';
import type {
  ServiceIntakeSchemaResponse,
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

export async function fetchStaffService(token: string, id: string): Promise<StaffServiceResponse> {
  const res = await bffServerFetch(token, `/services/${encodeURIComponent(id)}`);
  await assertOk(res, ServiceDetailFetchError);
  return res.json() as Promise<StaffServiceResponse>;
}

export class ServiceIntakeSchemaFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(`Failed to fetch service intake schema (${status})`, status, code, field, detail);
    this.name = 'ServiceIntakeSchemaFetchError';
  }
}

export async function fetchServiceIntakeSchema(
  token: string,
  id: string,
): Promise<ServiceIntakeSchemaResponse> {
  const res = await bffServerFetch(token, `/services/${encodeURIComponent(id)}/intake-schema`);
  await assertOk(res, ServiceIntakeSchemaFetchError);
  return res.json() as Promise<ServiceIntakeSchemaResponse>;
}
