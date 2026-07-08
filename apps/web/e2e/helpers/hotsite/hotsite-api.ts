import type { APIResponse, Page } from '@playwright/test';
import type {
  HotsiteAdminContentResponse,
  HotsiteManifestResponse,
  PublishHotsiteResponse,
  UnpublishHotsiteResponse,
} from '@ikaro/types';
import { BFF_URL } from '../auth/shared';

async function readJson<T>(res: APIResponse, action: string): Promise<T> {
  if (!res.ok()) {
    throw new Error(`${action} failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function getHotsiteConfig(page: Page): Promise<HotsiteAdminContentResponse> {
  const res = await page.request.get(`${BFF_URL}/tenants/hotsite`);
  return readJson(res, 'get hotsite config');
}

// Full-content snapshot -> PATCH body, used to restore a tenant's hotsite to its pre-test state
// in afterEach. Hotsite config is shared, tenant-wide state (one row per tenant, not creatable
// per test the way a service/booking is), so any test that mutates it must put it back —
// same rationale as helpers/platform/settings-api.ts's toUpdateRequest.
export function toUpdateRequest(
  content: HotsiteAdminContentResponse,
): Pick<HotsiteAdminContentResponse, 'branding' | 'layout' | 'seo'> {
  return { branding: content.branding, layout: content.layout, seo: content.seo };
}

export async function updateHotsiteConfig(
  page: Page,
  body: Pick<HotsiteAdminContentResponse, 'branding' | 'layout' | 'seo'>,
): Promise<HotsiteAdminContentResponse> {
  const res = await page.request.patch(`${BFF_URL}/tenants/hotsite`, { data: body });
  return readJson(res, 'update hotsite config');
}

export async function publishHotsite(page: Page): Promise<PublishHotsiteResponse> {
  const res = await page.request.post(`${BFF_URL}/tenants/hotsite/publish`);
  return readJson(res, 'publish hotsite');
}

export async function unpublishHotsite(page: Page): Promise<UnpublishHotsiteResponse> {
  const res = await page.request.post(`${BFF_URL}/tenants/hotsite/unpublish`);
  return readJson(res, 'unpublish hotsite');
}

// Reads the PUBLIC manifest directly rather than navigating to the public hotsite page —
// the public page is ISR-cached (docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md), so asserting
// isPublished via a page navigation right after Publish/Unpublish would be racing the cache's
// on-demand revalidation instead of testing the editor's actual behavior.
export async function getPublicManifest(
  page: Page,
  slug: string,
): Promise<HotsiteManifestResponse> {
  const res = await page.request.get(`${BFF_URL}/public/platform/manifest/${slug}`);
  return readJson(res, 'get public manifest');
}
