import type {
  CreateServiceRequest,
  StaffServiceListResponse,
  StaffServiceResponse,
  UpdateServiceRequest,
} from '@ikaro/types';
import { bffClient } from '../bff-client';
import { bffServerFetch } from '../bff-server';

export async function listServices(): Promise<StaffServiceListResponse> {
  const res = await bffClient.get<StaffServiceListResponse>('/services');
  return res.data;
}

export async function fetchStaffServices(token: string): Promise<StaffServiceListResponse> {
  const res = await bffServerFetch(token, '/services', {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Failed to fetch services (${res.status})`);
  return res.json() as Promise<StaffServiceListResponse>;
}

export async function getService(id: string): Promise<StaffServiceResponse> {
  const res = await bffClient.get<StaffServiceResponse>(`/services/${id}`);
  return res.data;
}

export async function createService(body: CreateServiceRequest): Promise<StaffServiceResponse> {
  const res = await bffClient.post<StaffServiceResponse>('/services', body);
  return res.data;
}

export async function updateService(
  id: string,
  body: UpdateServiceRequest,
): Promise<StaffServiceResponse> {
  const res = await bffClient.patch<StaffServiceResponse>(`/services/${id}`, body);
  return res.data;
}

export async function deactivateService(id: string): Promise<void> {
  await bffClient.delete(`/services/${id}`);
}
