import type {
  CreateServiceRequest,
  PublishServiceIntakeSchemaRequest,
  ResourceRequirementItem,
  ServiceBookingPolicyItem,
  ServiceIntakeSchemaResponse,
  ServiceIntakeSchemaVersion,
  ServiceLegItem,
  StaffServiceListResponse,
  StaffServiceResponse,
  UpdateServiceBookingPolicyRequest,
  UpdateServiceLegsRequest,
  UpdateServiceRequest,
  UpdateServiceResourceRequirementsRequest,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

export interface UpdateServiceResourceRequirementsResponse {
  id: string;
  resourceRequirements: ResourceRequirementItem[];
}

export interface UpdateServiceLegsResponse {
  id: string;
  legs: ServiceLegItem[];
  totalSpanMinutes: number;
}

export interface UpdateServiceBookingPolicyResponse {
  id: string;
  bookingPolicy: ServiceBookingPolicyItem;
}

export type PublishServiceIntakeSchemaResponse = ServiceIntakeSchemaVersion;

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

export async function updateServiceResourceRequirements(
  id: string,
  body: UpdateServiceResourceRequirementsRequest,
): Promise<UpdateServiceResourceRequirementsResponse> {
  const res = await bffClient.patch<UpdateServiceResourceRequirementsResponse>(
    `/services/${id}/resource-requirements`,
    body,
  );
  return res.data;
}

export async function updateServiceLegs(
  id: string,
  body: UpdateServiceLegsRequest,
): Promise<UpdateServiceLegsResponse> {
  const res = await bffClient.put<UpdateServiceLegsResponse>(`/services/${id}/legs`, body);
  return res.data;
}

export async function updateServiceBookingPolicy(
  id: string,
  body: UpdateServiceBookingPolicyRequest,
): Promise<UpdateServiceBookingPolicyResponse> {
  const res = await bffClient.patch<UpdateServiceBookingPolicyResponse>(
    `/services/${id}/booking-policy`,
    body,
  );
  return res.data;
}

export async function publishServiceIntakeSchema(
  id: string,
  body: PublishServiceIntakeSchemaRequest,
): Promise<PublishServiceIntakeSchemaResponse> {
  const res = await bffClient.post<PublishServiceIntakeSchemaResponse>(
    `/services/${id}/intake-schema`,
    body,
  );
  return res.data;
}

export async function getServiceIntakeSchema(id: string): Promise<ServiceIntakeSchemaResponse> {
  const res = await bffClient.get<ServiceIntakeSchemaResponse>(`/services/${id}/intake-schema`);
  return res.data;
}
