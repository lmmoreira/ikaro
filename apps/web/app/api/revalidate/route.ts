import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import {
  HOTSITE_PUBLISHED_SLUGS_CACHE_TAG,
  hotsiteManifestCacheTag,
  hotsiteServicesCacheTag,
} from '@/features/platform/hotsite/revalidate';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-revalidate-secret');

  if (!secret || secret !== process.env.HOTSITE_REVALIDATE_SECRET) {
    return NextResponse.json({ message: 'Invalid or missing secret' }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ message: 'Missing slug' }, { status: 400 });
  }

  // Generic "this tenant's public hotsite data changed" signal — called from
  // hotsite publish/unpublish (backend) and from service create/update/
  // activate/deactivate (booking-platform.adapter.ts's revalidatePublicPages).
  // revalidatePath alone doesn't reliably clear these fetches' cached Data
  // Cache entries if the route is ever forced dynamic (see
  // docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md §6), so revalidateTag is used for
  // each tagged fetch too, which doesn't depend on the route's caching mode.
  //
  // Next 16 requires a second argument on revalidateTag. A named profile like
  // 'max' only marks the entry stale and serves the previous cached content on
  // the next request while refreshing in the background (stale-while-revalidate)
  // — NOT what we want here. { expire: 0 } instead forces a blocking
  // cache-miss on the next request, so the freshly published content is what
  // the very next visitor actually gets. updateTag() would be the more
  // idiomatic immediate-invalidation call, but it's restricted to Server
  // Actions and this is a GET Route Handler.
  revalidatePath(`/${slug}`, 'page');
  revalidateTag(hotsiteManifestCacheTag(slug), { expire: 0 });
  revalidateTag(hotsiteServicesCacheTag(slug), { expire: 0 });
  // Unconditional, even though only publish/unpublish actually changes the published-hotsites
  // list (service CRUD doesn't) — this route has no signal to distinguish why it was called, and
  // re-fetching the list on a service-CRUD call is cheap and idempotent. Without this, publishing
  // or unpublishing a tenant could leave /sitemap.xml stale for up to HOTSITE_REVALIDATE_SECONDS.
  revalidateTag(HOTSITE_PUBLISHED_SLUGS_CACHE_TAG, { expire: 0 });

  return NextResponse.json({ revalidated: true, slug });
}
