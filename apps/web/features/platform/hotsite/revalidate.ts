export const HOTSITE_REVALIDATE_SECONDS = 300;

// Single source of truth for the manifest fetch's cache tag — api.ts's
// fetchManifestResponse() tags the fetch with this; app/api/revalidate/route.ts
// calls revalidateTag() with the same value on publish. revalidatePath() alone
// doesn't reliably clear this fetch's Data Cache entry, because the hotsite page
// is forced fully dynamic (HotsiteAuthBar reads cookies()), so it never gets a
// Route Cache entry for revalidatePath to cascade the invalidation from.
export function hotsiteManifestCacheTag(slug: string): string {
  return `hotsite-manifest-${slug}`;
}
