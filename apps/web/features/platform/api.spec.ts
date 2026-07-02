import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw Object.assign(new Error('NEXT_NOT_FOUND'), { digest: 'NEXT_NOT_FOUND' });
  }),
}));

import type { HotsiteManifestResponse, HotsiteSitemapEntryListResponse } from '@ikaro/types';
import { notFound } from 'next/navigation';
import { fetchManifest, fetchPublishedHotsiteSlugs } from './api';

const mockNotFound = vi.mocked(notFound);

const BFF_URL = 'http://bff-test:3002';

function makeManifest(): HotsiteManifestResponse {
  return {
    tenant: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Tenant A',
      slug: 'tenant-a',
    },
    branding: {
      logoUrl: '',
      primaryColor: '#0055A4',
      secondaryColor: '#FFFFFF',
      backgroundColor: '#F5F5F5',
      textColor: '#111111',
      headingFontFamily: 'Inter',
      bodyFontFamily: 'Roboto',
      borderRadius: 'rounded',
      spacing: 'comfortable',
      shadowStyle: 'subtle',
      buttonStyle: 'filled',
    },
    layout: [],
    seo: { title: null, description: null },
    isPublished: true,
    business: {
      phone: null,
      email: null,
      address: null,
      socialLinks: null,
    },
    localization: {
      language: 'pt-BR',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      phonePrefix: '+55',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: '1.234,56',
      firstDayOfWeek: 0,
      address: {
        postalLabel: 'CEP',
        postalPlaceholder: '00000-000',
        stateLabel: 'UF',
        requireNeighborhood: true,
        neighborhoodLabel: 'Bairro',
        streetLabel: 'Rua',
        numberLabel: 'Número',
        complementLabel: 'Complemento',
        cityLabel: 'Cidade',
        lookupService: 'viacep',
      },
    },
  };
}

describe('fetchManifest', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the manifest on a successful BFF response', async () => {
    const manifest = makeManifest();
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(manifest), { status: 200 }));

    const result = await fetchManifest('tenant-a');

    expect(result.tenant.slug).toBe('tenant-a');
    expect(result.tenant.id).toBe(manifest.tenant.id);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/public/platform/manifest/tenant-a`,
      expect.objectContaining({ next: { revalidate: 300 } }),
    );
  });

  it('calls notFound() when the BFF returns 404', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(fetchManifest('unknown-slug')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it('throws when the BFF returns a non-404 error', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(fetchManifest('tenant-a')).rejects.toThrow(/Failed to fetch manifest/);
  });
});

describe('fetchPublishedHotsiteSlugs', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the list of published hotsites on a successful BFF response', async () => {
    const response: HotsiteSitemapEntryListResponse = {
      items: [{ slug: 'tenant-a', updatedAt: '2026-06-10T12:00:00.000Z' }],
    };
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));

    const result = await fetchPublishedHotsiteSlugs();

    expect(result).toEqual(response);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/public/platform/published-hotsites`,
      expect.objectContaining({ next: { revalidate: 300 } }),
    );
  });

  it('throws when the BFF returns an error', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(fetchPublishedHotsiteSlugs()).rejects.toThrow(
      /Failed to fetch published hotsites/,
    );
  });
});
