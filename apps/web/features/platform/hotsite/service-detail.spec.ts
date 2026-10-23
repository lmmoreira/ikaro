import { describe, expect, it } from 'vitest';
import type { HotsiteManifestResponse, HotsiteModuleResponse } from '@ikaro/types';
import {
  resolveServiceDetailFooter,
  resolveServiceMetaDescription,
  resolveServiceDetailSettings,
  SERVICE_DETAIL_PAGE_DEFAULTS,
} from './service-detail';

type LayoutOnly = Pick<HotsiteManifestResponse, 'layout'>;

function serviceList(
  detailPage: unknown,
  overrides: Partial<HotsiteModuleResponse> = {},
): HotsiteModuleResponse {
  return {
    type: 'SERVICE_LIST',
    enabled: true,
    data: { showPrices: true, showPoints: true, layout: 'grid', detailPage },
    ...overrides,
  } as HotsiteModuleResponse;
}

describe('resolveServiceDetailSettings()', () => {
  it('uses the SERVICE_LIST detailPage settings', () => {
    const detailPage = {
      heroStyle: 'compact',
      galleryLayout: 'featured',
      showPrice: false,
      showDuration: true,
      showLoyaltyPoints: false,
      bookingCtaLabel: 'Quero agendar',
    };

    expect(
      resolveServiceDetailSettings({ layout: [serviceList(detailPage)] } as LayoutOnly),
    ).toEqual(detailPage);
  });

  it('still reads the settings of a disabled SERVICE_LIST (the manager only hid its home section)', () => {
    const detailPage = { ...SERVICE_DETAIL_PAGE_DEFAULTS, showPrice: false };

    const settings = resolveServiceDetailSettings({
      layout: [serviceList(detailPage, { enabled: false })],
    } as LayoutOnly);

    expect(settings.showPrice).toBe(false);
  });

  it.each([
    ['a SERVICE_LIST without detailPage', { layout: [serviceList(undefined)] }],
    ['no SERVICE_LIST at all', { layout: [] }],
    ['invalid detailPage data', { layout: [serviceList({ heroStyle: 'giant' })] }],
  ])('falls back to the defaults for %s', (_label, manifest) => {
    expect(resolveServiceDetailSettings(manifest as LayoutOnly)).toEqual(
      SERVICE_DETAIL_PAGE_DEFAULTS,
    );
  });

  it('defaults match the documented look (cover, grid, everything shown)', () => {
    expect(SERVICE_DETAIL_PAGE_DEFAULTS).toEqual({
      heroStyle: 'cover',
      galleryLayout: 'grid',
      showPrice: true,
      showDuration: true,
      showLoyaltyPoints: true,
    });
  });
});

describe('resolveServiceDetailFooter()', () => {
  it('returns the enabled FOOTER module data', () => {
    const footer = { type: 'FOOTER', enabled: true, data: { tagline: 'Cuidado' } };

    expect(resolveServiceDetailFooter({ layout: [footer] } as LayoutOnly)).toEqual({
      tagline: 'Cuidado',
    });
  });

  it('returns null for a disabled FOOTER, an absent FOOTER or invalid data', () => {
    const disabled = { type: 'FOOTER', enabled: false, data: {} };
    const invalid = { type: 'FOOTER', enabled: true, data: { showWhatsapp: 'yes' } };

    expect(resolveServiceDetailFooter({ layout: [disabled] } as LayoutOnly)).toBeNull();
    expect(resolveServiceDetailFooter({ layout: [] })).toBeNull();
    expect(resolveServiceDetailFooter({ layout: [invalid] } as LayoutOnly)).toBeNull();
  });
});

describe('resolveServiceMetaDescription()', () => {
  const profile = (longDescription: string | null) => ({
    coverImageUrl: null,
    galleryImageUrls: [],
    longDescription,
    inclusions: [],
    preparationNotes: null,
  });

  it('prefers the short description', () => {
    expect(
      resolveServiceMetaDescription({ description: 'Curta.', profile: profile('Longa.') }),
    ).toBe('Curta.');
  });

  it('falls back to the long description without its Markdown marks', () => {
    expect(
      resolveServiceMetaDescription({
        description: null,
        profile: profile('**Uma pausa** para o [corpo](https://x.test)\n\n- Acolhimento'),
      }),
    ).toBe('Uma pausa para o corpo Acolhimento');
  });

  it('cuts a long text to 160 characters with an ellipsis', () => {
    const result = resolveServiceMetaDescription({
      description: null,
      profile: profile('palavra '.repeat(60)),
    });

    expect(result).toHaveLength(160);
    expect(result?.endsWith('…')).toBe(true);
  });

  it('is undefined when there is nothing to say (the tenant SEO description stands in)', () => {
    expect(
      resolveServiceMetaDescription({ description: null, profile: profile(null) }),
    ).toBeUndefined();
    expect(
      resolveServiceMetaDescription({ description: null, profile: profile('***') }),
    ).toBeUndefined();
  });
});
