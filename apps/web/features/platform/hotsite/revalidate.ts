export const HOTSITE_REVALIDATE_SECONDS = 300;

// Next.js caps a single cache tag at 256 characters. Slug has no upper-length
// bound of its own (shared/value-objects/slug.vo.ts only checks length > 0), so
// every *CacheTag() helper below truncates deterministically — every call site
// (the fetch that sets the tag, and app/api/revalidate/route.ts's revalidateTag
// call) goes through the same function, so they always agree on the same
// (possibly truncated) tag for a given slug.
const MAX_TAG_LENGTH = 256;

function boundedCacheTag(prefix: string, slug: string): string {
  return `${prefix}${slug.slice(0, MAX_TAG_LENGTH - prefix.length)}`;
}

// Single source of truth for the manifest fetch's cache tag — api.ts's
// fetchManifestResponse() tags the fetch with this; app/api/revalidate/route.ts
// calls revalidateTag() with the same value on publish. Tag-based invalidation
// is used instead of relying solely on revalidatePath() because the hotsite
// route isn't guaranteed to always be static — a Dynamic API (cookies()/
// headers()) added anywhere in its render tree in the future would force it
// dynamic again (see docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md §6), at which
// point revalidatePath() no longer reliably cascades into this fetch's Data
// Cache entry. revalidateTag works the same either way.
export function hotsiteManifestCacheTag(slug: string): string {
  return boundedCacheTag('hotsite-manifest-', slug);
}

// Same reasoning as hotsiteManifestCacheTag, for the booking page's services
// list (apps/web/features/platform/hotsite/api/services.ts's fetchServices).
// Invalidated on service create/update/activate/deactivate — see
// apps/backend/src/contexts/booking/infrastructure/cross-context/booking-platform.adapter.ts's
// revalidatePublicPages().
export function hotsiteServicesCacheTag(slug: string): string {
  return boundedCacheTag('hotsite-services-', slug);
}
