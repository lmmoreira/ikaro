import MockAdapter from 'axios-mock-adapter';
import { afterEach, describe, expect, it } from 'vitest';
import type { HotsiteManifestResponse } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';
import { fetchManifestClient } from './api';

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
    booking: {
      maxBookingAdvanceDays: 90,
    },
  };
}

describe('fetchManifestClient', () => {
  const mock = new MockAdapter(bffClient);

  afterEach(() => mock.reset());

  it('returns the manifest via bffClient (same-origin /v1 gateway, no Next cache options)', async () => {
    const manifest = makeManifest();
    mock.onGet('/public/platform/manifest/tenant-a').reply(200, manifest);

    const result = await fetchManifestClient('tenant-a');

    expect(result.tenant.slug).toBe('tenant-a');
    expect(mock.history.get?.[0]?.url).toBe('/public/platform/manifest/tenant-a');
  });

  it('rejects when the BFF returns an error', async () => {
    mock.onGet('/public/platform/manifest/tenant-a').reply(500);

    await expect(fetchManifestClient('tenant-a')).rejects.toThrow();
  });
});
