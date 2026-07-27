import type { HotsiteManifestResponse } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

// Client-only — HotsitePreview.tsx's live-preview fetch (re-fetched on demand while editing, not
// on a schedule). No Next Data Cache options (next.revalidate/tags): browser requests don't
// participate in Next's Data Cache anyway, and this goes through the same-origin /v1 gateway
// (bffClient) rather than a raw fetch(). Server call sites (pages/layouts) use fetchManifest()/
// fetchManifestResponse() in api.server.ts instead — those carry the cache tag that
// app/api/revalidate/route.ts invalidates on publish.
export async function fetchManifestClient(slug: string): Promise<HotsiteManifestResponse> {
  const res = await bffClient.get<HotsiteManifestResponse>(
    `/public/platform/manifest/${encodeURIComponent(slug)}`,
  );
  return res.data;
}
