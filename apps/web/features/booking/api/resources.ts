import type {
  CreateResourceRequest,
  ResourceListResponse,
  ResourceResponse,
  UpdateResourceRequest,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

export type {
  CreateResourceRequest,
  ResourceListResponse,
  ResourceResponse,
  UpdateResourceRequest,
};

export interface ListResourcesQuery {
  readonly type?: 'LOCATION' | 'STAFF' | 'ROOM' | 'EQUIPMENT';
  readonly isActive?: boolean;
}

export async function listResources(query?: ListResourcesQuery): Promise<ResourceListResponse> {
  const res = await bffClient.get<ResourceListResponse>('/resources', { params: query });
  return res.data;
}

export async function getResource(id: string): Promise<ResourceResponse> {
  const res = await bffClient.get<ResourceResponse>(`/resources/${id}`);
  return res.data;
}

export async function createResource(body: CreateResourceRequest): Promise<ResourceResponse> {
  const res = await bffClient.post<ResourceResponse>('/resources', body);
  return res.data;
}

export async function updateResource(
  id: string,
  body: UpdateResourceRequest,
): Promise<ResourceResponse> {
  const res = await bffClient.patch<ResourceResponse>(`/resources/${id}`, body);
  return res.data;
}

export async function deactivateResource(id: string): Promise<void> {
  await bffClient.delete(`/resources/${id}`);
}

export async function reactivateResource(id: string): Promise<ResourceResponse> {
  const res = await bffClient.post<ResourceResponse>(`/resources/${id}/reactivate`, {});
  return res.data;
}
