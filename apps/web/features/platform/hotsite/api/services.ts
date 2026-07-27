import type { HotsiteServiceListResponse, HotsiteServiceResponse } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

// Client-only — HotsitePreview.tsx's live-preview fetch. No Next Data Cache options: browser
// requests don't participate in Next's Data Cache anyway, and this goes through the same-origin
// /v1 gateway (bffClient). Server call sites use fetchServices() in services.server.ts instead.
export async function fetchServicesClient(slug: string): Promise<HotsiteServiceResponse[]> {
  const res = await bffClient.get<HotsiteServiceListResponse>('/public/services', {
    headers: { 'X-Tenant-Slug': slug },
  });
  return res.data.items;
}
