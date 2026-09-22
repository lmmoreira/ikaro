import type {
  CreateResourceRequest,
  ResourceListResponse,
  ResourceResponse,
  ResourceStaffOptionsResponse,
  UpdateResourceRequest,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

export type {
  CreateResourceRequest,
  ResourceListResponse,
  ResourceResponse,
  ResourceStaffOptionsResponse,
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

// Merges Staff + Resource reads server-side (docs/24-BFF_ARCHITECTURE.md § Web-facing
// composite views) — the STAFF picker's data source; each item already carries isWrapped.
export async function getResourceStaffOptions(
  excludeResourceId?: string,
): Promise<ResourceStaffOptionsResponse> {
  const res = await bffClient.get<ResourceStaffOptionsResponse>('/resources/staff-options', {
    params: excludeResourceId ? { excludeResourceId } : undefined,
  });
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
