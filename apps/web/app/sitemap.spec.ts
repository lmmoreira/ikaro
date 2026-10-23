import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteServiceResponse, HotsiteSitemapEntryListResponse } from '@ikaro/types';
import { makeHotsiteService } from '@/test-utils';

vi.mock('@/features/platform/api.server', () => ({
  fetchPublishedHotsiteSlugs: vi.fn(),
}));
vi.mock('@/features/platform/hotsite/api/services.server', () => ({
  fetchServices: vi.fn(),
}));

import { fetchPublishedHotsiteSlugs } from '@/features/platform/api.server';
import { fetchServices } from '@/features/platform/hotsite/api/services.server';
import { SITE_URL } from '@/features/platform/hotsite/seo';
import sitemap from './sitemap';

const mockFetchPublishedHotsiteSlugs = vi.mocked(fetchPublishedHotsiteSlugs);
const mockFetchServices = vi.mocked(fetchServices);

function service(overrides: Partial<HotsiteServiceResponse>): HotsiteServiceResponse {
  return makeHotsiteService(overrides);
}

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
    mockFetchServices.mockResolvedValue([]);

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
    expect(mockFetchServices).not.toHaveBeenCalled();
  });

  describe('service pages (TD56-S03, UC-109)', () => {
    it('adds one entry per active service with a published page, none for the rest', async () => {
      mockFetchPublishedHotsiteSlugs.mockResolvedValue({
        items: [{ slug: 'vitta', updatedAt: '2026-06-10T12:00:00.000Z' }],
      });
      mockFetchServices.mockResolvedValue([
        service({ id: '1', publicSlug: 'massagem' }),
        service({ id: '2', publicSlug: null }),
        service({ id: '3', publicSlug: 'drenagem' }),
        service({ id: '4', publicSlug: 'inativo', isActive: false }),
      ]);

      const result = await sitemap();

      expect(result).toEqual([
        { url: `${SITE_URL}/vitta`, lastModified: '2026-06-10T12:00:00.000Z' },
        { url: `${SITE_URL}/vitta/servicos/massagem`, lastModified: '2026-06-10T12:00:00.000Z' },
        { url: `${SITE_URL}/vitta/servicos/drenagem`, lastModified: '2026-06-10T12:00:00.000Z' },
      ]);
    });

    it('lists no service page for a service whose page is unpublished or cleared (no slug)', async () => {
      mockFetchPublishedHotsiteSlugs.mockResolvedValue({
        items: [{ slug: 'vitta', updatedAt: '2026-06-10T12:00:00.000Z' }],
      });
      mockFetchServices.mockResolvedValue([service({ publicSlug: null })]);

      const result = await sitemap();

      expect(result.map((entry) => entry.url)).toEqual([`${SITE_URL}/vitta`]);
    });

    it('skips a tenant whose services cannot be read and still lists the others (named: failure isolation)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockFetchPublishedHotsiteSlugs.mockResolvedValue({
        items: [
          { slug: 'broken', updatedAt: '2026-06-10T12:00:00.000Z' },
          { slug: 'vitta', updatedAt: '2026-06-11T08:30:00.000Z' },
        ],
      });
      mockFetchServices.mockImplementation(async (slug) => {
        if (slug === 'broken') throw new Error('BFF down');
        return [service({ publicSlug: 'massagem' })];
      });

      const result = await sitemap();

      expect(result.map((entry) => entry.url)).toEqual([
        `${SITE_URL}/broken`,
        `${SITE_URL}/vitta`,
        `${SITE_URL}/vitta/servicos/massagem`,
      ]);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"broken"'));
      errorSpy.mockRestore();
    });

    it('reads every tenant, however many there are (batched)', async () => {
      const items = Array.from({ length: 25 }, (_, index) => ({
        slug: `t${index}`,
        updatedAt: '2026-06-10T12:00:00.000Z',
      }));
      mockFetchPublishedHotsiteSlugs.mockResolvedValue({ items });
      mockFetchServices.mockResolvedValue([]);

      const result = await sitemap();

      expect(mockFetchServices).toHaveBeenCalledTimes(25);
      expect(result).toHaveLength(25);
    });
  });
});
