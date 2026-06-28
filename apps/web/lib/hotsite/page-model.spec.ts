import { describe, expect, it } from 'vitest';
import type { HotsiteManifestResponse, HotsiteModuleResponse } from '@ikaro/types';
import { buildHotsiteModuleRenderPlan, resolveHotsiteDisplayName } from './page-model';

function makeLayoutItem(
  overrides: Partial<HotsiteModuleResponse> & Pick<HotsiteModuleResponse, 'type' | 'data'>,
): HotsiteModuleResponse {
  return {
    enabled: true,
    ...overrides,
  };
}

describe('resolveHotsiteDisplayName', () => {
  it('prefers the branding name when present', () => {
    const manifest = {
      branding: { brandName: 'BELOAUTO' },
      tenant: { name: 'Belo Auto' },
    } as HotsiteManifestResponse;

    expect(resolveHotsiteDisplayName(manifest)).toBe('BELOAUTO');
  });

  it('falls back to the tenant name when branding name is absent', () => {
    const manifest = {
      branding: {},
      tenant: { name: 'Belo Auto' },
    } as HotsiteManifestResponse;

    expect(resolveHotsiteDisplayName(manifest)).toBe('Belo Auto');
  });
});

describe('buildHotsiteModuleRenderPlan', () => {
  it('filters disabled and invalid modules and keeps the alternation contract', () => {
    const layout = [
      makeLayoutItem({
        type: 'HERO',
        data: {
          variant: 'centered',
          title: 'Hero',
          ctaLabel: 'Agendar',
          ctaTarget: 'booking-form',
        },
      }),
      makeLayoutItem({
        type: 'ABOUT',
        data: {
          title: 'Sobre nós',
          body: 'Conteúdo válido',
          imagePosition: 'left',
        },
      }),
      makeLayoutItem({
        type: 'CONTACT',
        enabled: false,
        data: {
          showAddress: true,
          showPhone: true,
          showWhatsapp: false,
          showEmail: false,
          showMap: false,
        },
      }),
      makeLayoutItem({
        type: 'FOOTER',
        data: {},
      }),
      makeLayoutItem({
        type: 'GALLERY',
        data: { layout: 'grid' },
      }),
    ];

    expect(buildHotsiteModuleRenderPlan(layout, true)).toEqual([
      { module: layout[0], bgVariant: 'default' },
      { module: layout[1], bgVariant: 'alt' },
      { module: layout[3], bgVariant: 'default' },
    ]);
  });

  it('keeps all backgrounds default when alternation is disabled', () => {
    const layout = [
      makeLayoutItem({
        type: 'HERO',
        data: {
          variant: 'centered',
          title: 'Hero',
          ctaLabel: 'Agendar',
          ctaTarget: 'booking-form',
        },
      }),
      makeLayoutItem({
        type: 'ABOUT',
        data: {
          title: 'Sobre nós',
          body: 'Conteúdo válido',
          imagePosition: 'left',
        },
      }),
    ];

    expect(buildHotsiteModuleRenderPlan(layout, false).map((item) => item.bgVariant)).toEqual([
      'default',
      'default',
    ]);
  });
});
