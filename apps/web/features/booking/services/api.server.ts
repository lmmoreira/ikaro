import 'server-only';
import type { StaffServiceListResponse, StaffServiceResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';

export async function fetchStaffServices(token: string): Promise<StaffServiceListResponse> {
  const res = await bffServerFetch(token, '/services', {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Failed to fetch services (${res.status})`);
  return res.json() as Promise<StaffServiceListResponse>;
}

export class ServiceDetailFetchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceDetailFetchError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export async function fetchStaffService(token: string, id: string): Promise<StaffServiceResponse> {
  const res = await bffServerFetch(token, `/services/${id}`);
  if (!res.ok) {
    throw new ServiceDetailFetchError(
      res.status,
      res.status === 404 ? 'Service not found' : `Failed to fetch service detail (${res.status})`,
    );
  }
  return res.json() as Promise<StaffServiceResponse>;
}
