import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw Object.assign(new Error('NEXT_NOT_FOUND'), { digest: 'NEXT_NOT_FOUND' });
  }),
}));

import type { HotsiteManifestResponse } from '@beloauto/types';
import { notFound } from 'next/navigation';
import { fetchManifest } from './platform';

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
    isPublished: true,
    business: {
      phone: null,
      email: null,
      address: null,
      socialLinks: null,
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
      `${BFF_URL}/platform/manifest/tenant-a`,
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
