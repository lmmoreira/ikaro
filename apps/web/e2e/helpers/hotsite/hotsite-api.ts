import type { APIResponse, Page } from '@playwright/test';
import type {
  HotsiteAdminContentResponse,
  HotsiteBrandingResponse,
  HotsiteManifestResponse,
  HotsiteModuleResponse,
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

// GET resolves every stored image field to a full public URL (deterministic, not signed) —
// PATCH requires the raw tenants/<id>/... storage path instead, or the backend's
// verifyImagesExist rejects it with 400. This mirrors the app's own
// stripResolvedImageUrls/mapHotsiteImageFields field list (same fix, same field set: branding
// logoUrl, module backgroundImageUrl/imageUrl/avatarUrl, testimonial avatarUrl, gallery image
// url) rather than importing it — e2e helpers deliberately don't import app feature/shared
// source, only other e2e helpers, so this is a self-contained copy scoped to this file. No
// tenantId parameter needed here (unlike the app's version): every value this suite ever reads
// back belongs to the one authenticated tenant for that test, so a generic
// tenants/<any-id>/... match is unambiguous. A value with no such segment (empty, or already a
// raw path) passes through unchanged.
const TENANT_STORAGE_PATH = /tenants\/[^/]+\/.*/;

function toRawPath(value: string): string {
  const match = TENANT_STORAGE_PATH.exec(value);
  return match ? match[0] : value;
}

function stripModuleImageUrls(module: HotsiteModuleResponse): HotsiteModuleResponse {
  const data = module.data;
  const mapped: Record<string, unknown> = { ...data };

  if (typeof data.backgroundImageUrl === 'string') {
    mapped.backgroundImageUrl = toRawPath(data.backgroundImageUrl);
  }
  if (typeof data.imageUrl === 'string') {
    mapped.imageUrl = toRawPath(data.imageUrl);
  }
  if (typeof data.avatarUrl === 'string') {
    mapped.avatarUrl = toRawPath(data.avatarUrl);
  }
  if (module.type === 'TESTIMONIALS' && Array.isArray(data.items)) {
    mapped.items = (data.items as ReadonlyArray<Record<string, unknown>>).map((item) =>
      typeof item.avatarUrl === 'string' ? { ...item, avatarUrl: toRawPath(item.avatarUrl) } : item,
    );
  }
  if (module.type === 'GALLERY' && Array.isArray(data.images)) {
    mapped.images = (data.images as ReadonlyArray<Record<string, unknown>>).map((image) =>
      typeof image.url === 'string' ? { ...image, url: toRawPath(image.url) } : image,
    );
  }

  return { ...module, data: mapped };
}

function stripBrandingImageUrls(branding: HotsiteBrandingResponse): HotsiteBrandingResponse {
  return { ...branding, logoUrl: toRawPath(branding.logoUrl) };
}

// Full-content snapshot -> PATCH body, used to restore a tenant's hotsite to its pre-test state
// in afterEach. Hotsite config is shared, tenant-wide state (one row per tenant, not creatable
// per test the way a service/booking is), so any test that mutates it must put it back —
// same rationale as helpers/platform/settings-api.ts's toUpdateRequest.
export function toUpdateRequest(
  content: HotsiteAdminContentResponse,
): Pick<HotsiteAdminContentResponse, 'branding' | 'layout' | 'seo'> {
  return {
    branding: stripBrandingImageUrls(content.branding),
    layout: content.layout.map(stripModuleImageUrls),
    seo: content.seo,
  };
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
