import {
  BillingErrorCode,
  type HotsiteServiceListResponse,
  type HotsiteServiceResponse,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';
import { ForbiddenError } from '@/shared/lib/api/errors';

// Client-only — HotsitePreview.tsx's live-preview fetch. No Next Data Cache options: browser
// requests don't participate in Next's Data Cache anyway, and this goes through the same-origin
// /v1 gateway (bffClient). Server call sites use fetchServices() in services.server.ts instead.
//
// A tenant without the `BOOKING` feature has no catalog: the typed denial is an empty list, so the
// editor preview of its hotsite still opens.
export async function fetchServicesClient(slug: string): Promise<HotsiteServiceResponse[]> {
  try {
    const res = await bffClient.get<HotsiteServiceListResponse>('/public/services', {
      headers: { 'X-Tenant-Slug': slug },
    });
    return res.data.items;
  } catch (err) {
    const body =
      err instanceof ForbiddenError ? (err.data as { code?: unknown } | undefined) : undefined;
    if (body?.code === BillingErrorCode.FEATURE_NOT_ENTITLED) return [];
    throw err;
  }
}
