import { describe, expect, it } from 'vitest';
import type { HotsiteManifestResponse, HotsiteModuleResponse } from '@ikaro/types';
import {
  buildHotsiteModuleRenderPlan,
  resolveHotsiteDisplayName,
  resolveHotsiteNavigation,
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

  it('parses a LEAD_FORM module and excludes it from the alternating-background rotation (M20-S07)', () => {
    const leadFormData = { title: 'Fale com a gente', ctaLabel: 'Preencher formulário' };
    const layout = [
      makeLayoutItem({ type: 'LEAD_FORM', data: leadFormData }),
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
      parsed: { type: 'LEAD_FORM', data: leadFormData },
      bgVariant: 'default',
    });
    // Same non-participating treatment as BOOKING_CTA/CHATBOT above — LEAD_FORM manages its own
    // section background via bgStyle, so it's excluded from the rotation but still advances the
    // underlying altIndex counter.
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

  // LEAD_FORM gets a normal, full-width section (unlike CHATBOT's fixed-position bubble/inline
  // widget), so it participates in the normal divider rhythm like BOOKING_CTA (M20-S07).
  it('renders the divider around a LEAD_FORM module like any ordinary module', () => {
    expect(shouldSkipDivider(2, 'LEAD_FORM', 'ABOUT')).toBe(false);
    expect(shouldSkipDivider(3, 'CONTACT', 'LEAD_FORM')).toBe(false);
  });
});

describe('TD56 modules in the render plan', () => {
  const heroData = {
    variant: 'centered' as const,
    title: 'Hero',
    ctaLabel: 'Agendar',
    ctaTarget: 'booking-form' as const,
  };
  const aboutData = { title: 'Sobre', body: 'Texto', imagePosition: 'left' as const };
  const galleryData = { images: [], layout: 'grid' as const, maxVisible: 6 };
  const contentBlockData = { variant: 'image-statement' as const, title: 'Nossa história' };
  const navigation = (
    targets: ('service-list' | 'gallery' | 'testimonials' | 'about' | 'contact')[],
    enabled = true,
  ): HotsiteModuleResponse =>
    makeLayoutItem({
      type: 'NAVIGATION',
      enabled,
      data: { items: targets.map((target) => ({ label: target, target })) },
    });

  describe('buildHotsiteModuleRenderPlan', () => {
    it('never turns NAVIGATION into a section plan item', () => {
      const plan = buildHotsiteModuleRenderPlan(
        [navigation(['about']), makeLayoutItem({ type: 'HERO', data: heroData })],
        false,
      );

      expect(plan.map((item) => item.parsed.type)).toEqual(['HERO']);
    });

    it('leaves alternation and the first-section divider rule untouched by a NAVIGATION above it', () => {
      const withNav = buildHotsiteModuleRenderPlan(
        [
          navigation([]),
          makeLayoutItem({ type: 'HERO', data: heroData }),
          makeLayoutItem({ type: 'ABOUT', data: aboutData }),
          makeLayoutItem({ type: 'GALLERY', data: galleryData }),
        ],
        true,
      );
      const withoutNav = buildHotsiteModuleRenderPlan(
        [
          makeLayoutItem({ type: 'HERO', data: heroData }),
          makeLayoutItem({ type: 'ABOUT', data: aboutData }),
          makeLayoutItem({ type: 'GALLERY', data: galleryData }),
        ],
        true,
      );

      expect(withNav).toEqual(withoutNav);
    });

    it('alternates a CONTENT_BLOCK like ABOUT/TESTIMONIALS', () => {
      const plan = buildHotsiteModuleRenderPlan(
        [
          makeLayoutItem({ type: 'HERO', data: heroData }),
          makeLayoutItem({ type: 'CONTENT_BLOCK', data: contentBlockData }),
          makeLayoutItem({ type: 'ABOUT', data: aboutData }),
        ],
        true,
      );

      expect(plan.map((item) => item.bgVariant)).toEqual(['default', 'alt', 'default']);
    });

    it('drops a CONTENT_BLOCK whose data does not parse', () => {
      const plan = buildHotsiteModuleRenderPlan(
        [makeLayoutItem({ type: 'CONTENT_BLOCK', data: { variant: 'banner', title: 'T' } })],
        false,
      );

      expect(plan).toEqual([]);
    });

    it('carries a valid presentation to the plan item', () => {
      const presentation = { surface: 'primary' as const, contentWidth: 'wide' as const };

      const [item] = buildHotsiteModuleRenderPlan(
        [makeLayoutItem({ type: 'ABOUT', data: aboutData, presentation })],
        false,
      );

      expect(item.presentation).toEqual(presentation);
    });

    it('gives no presentation key to a module that has none', () => {
      const [item] = buildHotsiteModuleRenderPlan(
        [makeLayoutItem({ type: 'ABOUT', data: aboutData })],
        false,
      );

      expect('presentation' in item).toBe(false);
    });

    // Negative guarantee: a cosmetic field must never blank a section the way malformed data does.
    it('ignores an invalid presentation but still renders the module', () => {
      const plan = buildHotsiteModuleRenderPlan(
        [
          makeLayoutItem({
            type: 'ABOUT',
            data: aboutData,
            presentation: { surface: 'custom' },
          }),
        ],
        false,
      );

      expect(plan).toHaveLength(1);
      expect(plan[0].parsed.type).toBe('ABOUT');
      expect(plan[0].presentation).toBeUndefined();
    });
  });

  describe('resolveHotsiteNavigation', () => {
    const sections = [
      makeLayoutItem({ type: 'HERO', data: heroData }),
      makeLayoutItem({ type: 'ABOUT', data: aboutData }),
      makeLayoutItem({ type: 'GALLERY', data: galleryData }),
    ];

    it('returns the items whose target section is in the render plan, in order', () => {
      const layout = [navigation(['gallery', 'about']), ...sections];

      expect(resolveHotsiteNavigation(layout, buildHotsiteModuleRenderPlan(layout, false))).toEqual(
        [
          { label: 'gallery', target: 'gallery' },
          { label: 'about', target: 'about' },
        ],
      );
    });

    it('drops an item whose target module is disabled or absent', () => {
      const layout = [
        navigation(['about', 'contact', 'testimonials']),
        makeLayoutItem({ type: 'ABOUT', data: aboutData, enabled: false }),
        makeLayoutItem({ type: 'HERO', data: heroData }),
      ];

      expect(resolveHotsiteNavigation(layout, buildHotsiteModuleRenderPlan(layout, false))).toEqual(
        [],
      );
    });

    it('drops an item whose target module data is malformed (it never made the plan)', () => {
      const layout = [
        navigation(['about', 'gallery']),
        makeLayoutItem({ type: 'ABOUT', data: { title: 'only a title' } }),
        makeLayoutItem({ type: 'GALLERY', data: galleryData }),
      ];

      expect(
        resolveHotsiteNavigation(layout, buildHotsiteModuleRenderPlan(layout, false)).map(
          (item) => item.target,
        ),
      ).toEqual(['gallery']);
    });

    it('returns nothing when NAVIGATION is absent', () => {
      expect(
        resolveHotsiteNavigation(sections, buildHotsiteModuleRenderPlan(sections, false)),
      ).toEqual([]);
    });

    it('returns nothing when NAVIGATION is disabled', () => {
      const layout = [navigation(['about'], false), ...sections];

      expect(resolveHotsiteNavigation(layout, buildHotsiteModuleRenderPlan(layout, false))).toEqual(
        [],
      );
    });

    it('returns nothing when NAVIGATION data is malformed', () => {
      const layout = [
        makeLayoutItem({ type: 'NAVIGATION', data: { items: [{ label: '', target: 'about' }] } }),
        ...sections,
      ];

      expect(resolveHotsiteNavigation(layout, buildHotsiteModuleRenderPlan(layout, false))).toEqual(
        [],
      );
    });
  });
});
