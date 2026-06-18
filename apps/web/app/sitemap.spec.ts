import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteSitemapEntryListResponse } from '@ikaro/types';

vi.mock('@/lib/api/platform', () => ({
  fetchPublishedHotsiteSlugs: vi.fn(),
}));

import { fetchPublishedHotsiteSlugs } from '@/lib/api/platform';
import { SITE_URL } from '@/lib/hotsite/seo';
import sitemap from './sitemap';

const mockFetchPublishedHotsiteSlugs = vi.mocked(fetchPublishedHotsiteSlugs);

describe('sitemap', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('maps each published hotsite to a sitemap entry', async () => {
    const response: HotsiteSitemapEntryListResponse = {
      items: [
        { slug: 'lavacar-bh', updatedAt: '2026-06-10T12:00:00.000Z' },
        { slug: 'lavacar-sp', updatedAt: '2026-06-11T08:30:00.000Z' },
      ],
    };
    mockFetchPublishedHotsiteSlugs.mockResolvedValue(response);

    const result = await sitemap();

    expect(result).toEqual([
      { url: `${SITE_URL}/lavacar-bh`, lastModified: '2026-06-10T12:00:00.000Z' },
      { url: `${SITE_URL}/lavacar-sp`, lastModified: '2026-06-11T08:30:00.000Z' },
    ]);
  });

  it('returns an empty array when there are no published hotsites', async () => {
    mockFetchPublishedHotsiteSlugs.mockResolvedValue({ items: [] });

    const result = await sitemap();

    expect(result).toEqual([]);
  });
});
