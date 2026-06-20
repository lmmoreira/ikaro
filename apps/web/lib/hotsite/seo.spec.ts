import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteManifestResponse } from '@ikaro/types';
import { SITE_URL, buildHotsiteMetadata, buildLocalBusinessJsonLd, toJsonLdScript } from './seo';

function makeManifest(overrides: Partial<HotsiteManifestResponse> = {}): HotsiteManifestResponse {
  return {
    tenant: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Lavacar BH',
      slug: 'lavacar-bh',
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
    ...overrides,
  };
}

describe('SITE_URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('falls back to http://localhost:3000 when NEXT_PUBLIC_SITE_URL is unset', async () => {
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.resetModules();

    const { SITE_URL: freshSiteUrl } = await import('./seo');

    expect(freshSiteUrl).toBe('http://localhost:3000');

    if (original !== undefined) process.env.NEXT_PUBLIC_SITE_URL = original;
  });

  it('reads NEXT_PUBLIC_SITE_URL when set', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://beloauto.com');
    vi.resetModules();

    const { SITE_URL: stubbedSiteUrl } = await import('./seo');

    expect(stubbedSiteUrl).toBe('https://beloauto.com');
  });

  it('strips a trailing slash from NEXT_PUBLIC_SITE_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://beloauto.com/');
    vi.resetModules();

    const { SITE_URL: stubbedSiteUrl } = await import('./seo');

    expect(stubbedSiteUrl).toBe('https://beloauto.com');
  });
});

describe('buildHotsiteMetadata', () => {
  it('builds title, description, canonical, and Open Graph from the manifest', () => {
    const manifest = makeManifest();

    const metadata = buildHotsiteMetadata({ manifest, slug: 'lavacar-bh' });

    expect(metadata.title).toBe('Lavacar BH — Agendamento Online');
    expect(metadata.description).toBe('Agende seu serviço na Lavacar BH. Rápido, fácil e online.');
    expect(metadata.alternates).toEqual({ canonical: `${SITE_URL}/lavacar-bh` });
    expect(metadata.openGraph).toMatchObject({
      title: 'Lavacar BH — Agendamento Online',
      description: 'Agende seu serviço na Lavacar BH. Rápido, fácil e online.',
      url: `${SITE_URL}/lavacar-bh`,
      siteName: 'Ikaro',
      locale: 'pt_BR',
      type: 'website',
    });
  });

  it('appends path to the canonical and Open Graph URL when provided', () => {
    const manifest = makeManifest();

    const metadata = buildHotsiteMetadata({ manifest, slug: 'lavacar-bh', path: '/booking' });

    expect(metadata.alternates).toEqual({ canonical: `${SITE_URL}/lavacar-bh/booking` });
    expect(metadata.openGraph).toMatchObject({ url: `${SITE_URL}/lavacar-bh/booking` });
  });

  it('sets robots to index/follow when the hotsite is published', () => {
    const manifest = makeManifest({ isPublished: true });

    const metadata = buildHotsiteMetadata({ manifest, slug: 'lavacar-bh' });

    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it('sets robots to noindex/nofollow when the hotsite is not published', () => {
    const manifest = makeManifest({ isPublished: false });

    const metadata = buildHotsiteMetadata({ manifest, slug: 'lavacar-bh' });

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('includes the branding logo as a sized Open Graph image when present', () => {
    const manifest = makeManifest({
      branding: { ...makeManifest().branding, logoUrl: 'https://cdn.example.com/logo.png' },
    });

    const metadata = buildHotsiteMetadata({ manifest, slug: 'lavacar-bh' });

    expect(metadata.openGraph?.images).toEqual([
      { url: 'https://cdn.example.com/logo.png', width: 1200, height: 630 },
    ]);
  });

  it('returns an empty Open Graph images array when there is no logo', () => {
    const manifest = makeManifest();

    const metadata = buildHotsiteMetadata({ manifest, slug: 'lavacar-bh' });

    expect(metadata.openGraph?.images).toEqual([]);
  });

  it('includes the city and state from business_info.address in title and description when present', () => {
    const manifest = makeManifest({
      business: {
        phone: null,
        email: null,
        address: {
          street: 'Av. Paulista',
          number: '1000',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01310100',
        },
        socialLinks: null,
      },
    });

    const metadata = buildHotsiteMetadata({ manifest, slug: 'lavacar-bh' });

    expect(metadata.title).toBe('Lavacar BH — Agendamento Online em São Paulo, SP');
    expect(metadata.description).toBe(
      'Agende seu serviço na Lavacar BH, em São Paulo, SP. Rápido, fácil e online.',
    );
  });

  it('derives the Open Graph locale from settings.localization.language', () => {
    const manifest = makeManifest({
      localization: {
        language: 'en-US',
        currency: 'USD',
        phonePrefix: '+1',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
        numberFormat: '1,234.56',
        firstDayOfWeek: 0,
        address: {
          postalLabel: 'ZIP Code',
          postalPlaceholder: '90210',
          stateLabel: 'State',
          requireNeighborhood: false,
          neighborhoodLabel: null,
          streetLabel: 'Street',
          numberLabel: 'Number',
          complementLabel: 'Apt, Suite, etc.',
          cityLabel: 'City',
          lookupService: 'none',
        },
      },
    });

    const metadata = buildHotsiteMetadata({ manifest, slug: 'lavacar-bh' });

    expect(metadata.openGraph).toMatchObject({ locale: 'en_US' });
  });

  it('uses the tenant-configured seo.title and seo.description when present', () => {
    const manifest = makeManifest({
      seo: {
        title: 'Lavacar Estrela — Agendamento Online em São Paulo',
        description: 'Agende sua lavagem na Lavacar Estrela. Rápido, fácil e online.',
      },
    });

    const metadata = buildHotsiteMetadata({ manifest, slug: 'lavacar-bh' });

    expect(metadata.title).toBe('Lavacar Estrela — Agendamento Online em São Paulo');
    expect(metadata.description).toBe(
      'Agende sua lavagem na Lavacar Estrela. Rápido, fácil e online.',
    );
    expect(metadata.openGraph).toMatchObject({
      title: 'Lavacar Estrela — Agendamento Online em São Paulo',
      description: 'Agende sua lavagem na Lavacar Estrela. Rápido, fácil e online.',
    });
  });

  it('falls back to the generated title/description when seo fields are null', () => {
    const manifest = makeManifest({ seo: { title: null, description: null } });

    const metadata = buildHotsiteMetadata({ manifest, slug: 'lavacar-bh' });

    expect(metadata.title).toBe('Lavacar BH — Agendamento Online');
    expect(metadata.description).toBe('Agende seu serviço na Lavacar BH. Rápido, fácil e online.');
  });
});

describe('buildLocalBusinessJsonLd', () => {
  it('builds a LocalBusiness entry with the tenant name and canonical URL', () => {
    const manifest = makeManifest();

    const jsonLd = buildLocalBusinessJsonLd({ manifest, slug: 'lavacar-bh' });

    expect(jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Lavacar BH',
      url: `${SITE_URL}/lavacar-bh`,
    });
  });
});

describe('toJsonLdScript', () => {
  it('serializes data as JSON', () => {
    const result = toJsonLdScript({ '@type': 'LocalBusiness', name: 'Lavacar BH' });

    expect(JSON.parse(result.replace(/\\u003c/g, '<'))).toEqual({
      '@type': 'LocalBusiness',
      name: 'Lavacar BH',
    });
  });

  it('escapes "<" so a "</script>" sequence cannot break out of the script tag', () => {
    const result = toJsonLdScript({ name: 'Foo</script><script>alert(1)</script>' });

    expect(result).not.toContain('</script>');
    expect(result).toContain('\\u003c/script>');
  });
});
