import type {
  CreateServiceRequest,
  StaffServiceListResponse,
  StaffServiceResponse,
  UpdateServiceRequest,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

export async function listServices(): Promise<StaffServiceListResponse> {
  const res = await bffClient.get<StaffServiceListResponse>('/services');
  return res.data;
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

export async function activateService(id: string): Promise<void> {
  await bffClient.patch(`/services/${id}/activate`, {});
}

export async function deactivateService(id: string): Promise<void> {
  await bffClient.delete(`/services/${id}`);
}
