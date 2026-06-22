import type { HotsiteServiceListResponse, HotsiteServiceResponse } from '@ikaro/types';
import { HOTSITE_REVALIDATE_SECONDS } from '@/lib/hotsite/revalidate';

export async function fetchServices(slug: string): Promise<HotsiteServiceResponse[]> {
  const isDev = process.env.NODE_ENV === 'development';
  const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/public/services`, {
    headers: { 'X-Tenant-Slug': slug },
    next: { revalidate: isDev ? 0 : HOTSITE_REVALIDATE_SECONDS },
  });

  if (!res.ok) throw new Error(`Failed to fetch services for slug "${slug}"`);

  const data = (await res.json()) as HotsiteServiceListResponse;
  return data.items;
}
