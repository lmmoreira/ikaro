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
  it('excludes disabled modules, parses valid data, and keeps the alternation contract', () => {
    const heroData = {
      variant: 'centered' as const,
      title: 'Hero',
      ctaLabel: 'Agendar',
      ctaTarget: 'booking-form' as const,
    };
    const aboutData = {
      title: 'Sobre nós',
      body: 'Conteúdo válido',
      imagePosition: 'left' as const,
    };

    const layout = [
      makeLayoutItem({ type: 'HERO', data: heroData }),
      makeLayoutItem({ type: 'ABOUT', data: aboutData }),
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
      makeLayoutItem({ type: 'FOOTER', data: {} }),
      makeLayoutItem({ type: 'GALLERY', data: { layout: 'grid' } }),
    ];

    const plan = buildHotsiteModuleRenderPlan(layout, true);

    expect(plan).toHaveLength(3);
    expect(plan[0]).toEqual({ parsed: { type: 'HERO', data: heroData }, bgVariant: 'default' });
    expect(plan[1]).toEqual({ parsed: { type: 'ABOUT', data: aboutData }, bgVariant: 'alt' });
    expect(plan[2]).toEqual({ parsed: { type: 'FOOTER', data: {} }, bgVariant: 'default' });
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
        data: { title: 'Sobre nós', body: 'Conteúdo válido', imagePosition: 'left' },
      }),
    ];

    expect(buildHotsiteModuleRenderPlan(layout, false).map((item) => item.bgVariant)).toEqual([
      'default',
      'default',
    ]);
  });

  it('excludes a module with malformed data instead of throwing', () => {
    const layout = [
      makeLayoutItem({
        type: 'HERO',
        // missing required fields: variant, ctaLabel, ctaTarget
        data: { title: 'Only title' },
      }),
      makeLayoutItem({
        type: 'ABOUT',
        data: { title: 'Sobre nós', body: 'Texto', imagePosition: 'right' },
      }),
    ];

    const plan = buildHotsiteModuleRenderPlan(layout, false);

    expect(plan).toHaveLength(1);
    expect(plan[0].parsed.type).toBe('ABOUT');
  });

  it('returns an empty plan when every enabled module is malformed', () => {
    const layout = [
      makeLayoutItem({ type: 'HERO', data: { title: 'no cta' } }),
      makeLayoutItem({ type: 'SERVICE_LIST', data: {} }),
    ];

    expect(buildHotsiteModuleRenderPlan(layout, false)).toHaveLength(0);
  });
});
