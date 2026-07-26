import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { hotsiteManifestCacheTag } from '@/features/platform/hotsite/revalidate';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-revalidate-secret');

  if (!secret || secret !== process.env.HOTSITE_REVALIDATE_SECRET) {
    return NextResponse.json({ message: 'Invalid or missing secret' }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ message: 'Missing slug' }, { status: 400 });
  }

  // revalidatePath alone doesn't reliably clear fetchManifestResponse's cached
  // data here: the hotsite page is forced fully dynamic (HotsiteAuthBar reads
  // cookies()), so it never gets a Route Cache entry for revalidatePath to
  // cascade the invalidation from. revalidateTag targets the Data Cache
  // directly and doesn't depend on that bookkeeping.
  //
  // Next 16 requires a second argument on revalidateTag. A named profile like
  // 'max' only marks the entry stale and serves the previous cached content on
  // the next request while refreshing in the background (stale-while-revalidate)
  // — NOT what we want for a publish action. { expire: 0 } instead forces a
  // blocking cache-miss on the next request, so the freshly published content
  // is what the very next visitor actually gets. updateTag() would be the more
  // idiomatic immediate-invalidation call, but it's restricted to Server
  // Actions and this is a GET Route Handler.
  revalidatePath(`/${slug}`, 'page');
  revalidateTag(hotsiteManifestCacheTag(slug), { expire: 0 });

  return NextResponse.json({ revalidated: true, slug });
}
