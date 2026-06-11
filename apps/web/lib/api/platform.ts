import { notFound } from 'next/navigation';
import type { HotsiteManifestResponse } from '@beloauto/types';
import { HOTSITE_REVALIDATE_SECONDS } from '@/lib/hotsite/revalidate';

export async function fetchManifest(slug: string): Promise<HotsiteManifestResponse> {
  const isDev = process.env.NODE_ENV === 'development';
  const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/platform/manifest/${slug}`, {
    next: { revalidate: isDev ? 0 : HOTSITE_REVALIDATE_SECONDS },
  });

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Failed to fetch manifest for slug "${slug}"`);

  return res.json() as Promise<HotsiteManifestResponse>;
}
