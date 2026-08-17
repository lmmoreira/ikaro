import { describe, expect, it } from 'vitest';
import type { HotsiteManifestResponse, HotsiteModuleResponse } from '@ikaro/types';
import {
  buildHotsiteModuleRenderPlan,
  resolveHotsiteDisplayName,
  shouldSkipDivider,
} from './page-model';

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

  it('parses TESTIMONIALS, BOOKING_CTA, and CONTACT modules with valid data', () => {
    const layout = [
      makeLayoutItem({
        type: 'TESTIMONIALS',
        data: { items: [], layout: 'grid' },
      }),
      makeLayoutItem({
        type: 'BOOKING_CTA',
        data: { title: 'Agende agora', ctaLabel: 'Agendar' },
      }),
      makeLayoutItem({
        type: 'CONTACT',
        data: {
          showAddress: true,
          showPhone: true,
          showWhatsapp: false,
          showEmail: false,
          showMap: false,
        },
      }),
    ];

    const plan = buildHotsiteModuleRenderPlan(layout, false);

    expect(plan).toHaveLength(3);
    expect(plan[0].parsed.type).toBe('TESTIMONIALS');
    expect(plan[1].parsed.type).toBe('BOOKING_CTA');
    expect(plan[2].parsed.type).toBe('CONTACT');
  });

  it('parses a CHATBOT module and excludes it from the alternating-background rotation', () => {
    const layout = [
      makeLayoutItem({ type: 'CHATBOT', data: { variant: 'inline' } }),
      makeLayoutItem({
        type: 'ABOUT',
        data: { title: 'Sobre nós', body: 'Conteúdo válido', imagePosition: 'left' },
      }),
      makeLayoutItem({
        type: 'TESTIMONIALS',
        data: { items: [], layout: 'grid' },
      }),
    ];

    const plan = buildHotsiteModuleRenderPlan(layout, true);

    expect(plan).toHaveLength(3);
    expect(plan[0]).toEqual({
      parsed: { type: 'CHATBOT', data: { variant: 'inline' } },
      bgVariant: 'default',
    });
    // CHATBOT still advances the underlying altIndex counter (like every enabled module does —
    // only the *output* bgVariant is suppressed for non-participating types), so ABOUT lands on
    // the odd altIndex slot and alternates, same as it would after any single non-participating
    // module (HERO/BOOKING_CTA/FOOTER already behave this way, per the first test in this file).
    expect(plan[1].bgVariant).toBe('alt');
    expect(plan[2].bgVariant).toBe('default');
  });
});

describe('shouldSkipDivider', () => {
  it('skips the divider for the first module regardless of type', () => {
    expect(shouldSkipDivider(0, 'HERO', undefined)).toBe(true);
  });

  it('skips the divider when the current module is CHATBOT', () => {
    expect(shouldSkipDivider(1, 'CHATBOT', 'HERO')).toBe(true);
  });

  it('skips the divider when the current module is FOOTER', () => {
    expect(shouldSkipDivider(3, 'FOOTER', 'CONTACT')).toBe(true);
  });

  // PR #385 review (Codex): the module immediately following CHATBOT must also skip its own
  // leading divider — CHATBOT's bubble variant is position: fixed and contributes no height to
  // the flow, so a divider here would be a stray orphaned line unrelated to anything above it.
  it('skips the divider for the module immediately following CHATBOT', () => {
    expect(shouldSkipDivider(2, 'CONTACT', 'CHATBOT')).toBe(true);
  });

  it('skips the divider for the module immediately following FOOTER', () => {
    expect(shouldSkipDivider(2, 'CONTACT', 'FOOTER')).toBe(true);
  });

  it('renders the divider between two ordinary modules', () => {
    expect(shouldSkipDivider(1, 'ABOUT', 'HERO')).toBe(false);
  });

  it('renders the divider between two ordinary modules later in the layout', () => {
    expect(shouldSkipDivider(3, 'TESTIMONIALS', 'GALLERY')).toBe(false);
  });
});
