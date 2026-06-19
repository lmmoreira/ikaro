import type { HotsiteServiceResponse } from '@ikaro/types';
import { bffClient } from '../bff-client';

export interface CreateServiceRequest {
  readonly name: string;
  readonly description?: string;
  readonly priceAmount: number;
  readonly durationMinutes: number;
  readonly loyaltyPointsValue: number;
  readonly requiresPickupAddress?: boolean;
}

export interface UpdateServiceRequest {
  readonly name?: string;
  readonly description?: string | null;
  readonly priceAmount?: number;
  readonly durationMinutes?: number;
  readonly loyaltyPointsValue?: number;
  readonly requiresPickupAddress?: boolean;
}

export async function createService(body: CreateServiceRequest): Promise<HotsiteServiceResponse> {
  const res = await bffClient.post<HotsiteServiceResponse>('/services', body);
  return res.data;
}

export async function updateService(
  id: string,
  body: UpdateServiceRequest,
): Promise<HotsiteServiceResponse> {
  const res = await bffClient.patch<HotsiteServiceResponse>(`/services/${id}`, body);
  return res.data;
}

export async function deactivateService(id: string): Promise<{ id: string; isActive: false }> {
  const res = await bffClient.delete<{ id: string; isActive: false }>(`/services/${id}`);
  return res.data;
}
