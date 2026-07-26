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
  revalidatePath(`/${slug}`, 'page');
  revalidateTag(hotsiteManifestCacheTag(slug));

  return NextResponse.json({ revalidated: true, slug });
}
