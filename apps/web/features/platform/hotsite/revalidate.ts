export const HOTSITE_REVALIDATE_SECONDS = 300;

// Single source of truth for the manifest fetch's cache tag — api.ts's
// fetchManifestResponse() tags the fetch with this; app/api/revalidate/route.ts
// calls revalidateTag() with the same value on publish. revalidatePath() alone
// doesn't reliably clear this fetch's Data Cache entry, because the hotsite page
// is forced fully dynamic (HotsiteAuthBar reads cookies()), so it never gets a
// Route Cache entry for revalidatePath to cascade the invalidation from.
const CACHE_TAG_PREFIX = 'hotsite-manifest-';
// Next.js caps a single cache tag at 256 characters. Slug has no upper-length
// bound of its own (shared/value-objects/slug.vo.ts only checks length > 0),
// so truncate deterministically here — both call sites (api.ts's fetch tag and
// route.ts's revalidateTag) go through this one function, so they always agree
// on the same (possibly truncated) tag for a given slug.
const MAX_TAG_LENGTH = 256;
const MAX_SLUG_LENGTH = MAX_TAG_LENGTH - CACHE_TAG_PREFIX.length;

export function hotsiteManifestCacheTag(slug: string): string {
  return `${CACHE_TAG_PREFIX}${slug.slice(0, MAX_SLUG_LENGTH)}`;
}
