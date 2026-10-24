import { HotsiteNavigationTargetNotEnabledError } from '../../domain/errors/platform-domain.error';
import {
  DEFAULT_HOTSITE_SEO,
  HotsiteModule,
  HotsiteModuleData,
} from '../../domain/hotsite-config.aggregate';
import { PackageTemplateCatalogueAdapter } from '../../infrastructure/adapters/package-template-catalogue.adapter';
import { MaterializedTemplate } from '../ports/template-catalogue.port';
import {
  HotsiteTemplateDraft,
  HotsiteTemplateMaterializer,
} from './hotsite-template-materializer.service';

const catalogue = new PackageTemplateCatalogueAdapter();
const IDENTITY = { brandName: 'Studio Aurora', tagline: 'Cuidado de verdade' };
const TENANT_LOGO = 'tenants/10000000-0000-4000-8000-000000000001/hotsite/branding/u1/logo.png';
const TENANT_GALLERY = [
  {
    url: 'tenants/10000000-0000-4000-8000-000000000001/hotsite/gallery/u1/a.png',
    source: 'upload',
  },
];
const TENANT_TESTIMONIALS = [{ authorName: 'Ana', text: 'Ótimo atendimento.', rating: 5 }];

function template(id: string, locale: 'pt-BR' | 'en' = 'pt-BR'): MaterializedTemplate {
  const materialized = catalogue.materialize(id, locale, IDENTITY);
  if (materialized === null) throw new Error(`unknown template ${id}`);
  return materialized;
}

function module(type: HotsiteModule['type'], enabled: boolean, data: object): HotsiteModule {
  return { type, enabled, data: data as HotsiteModuleData };
}

function draft(overrides: Partial<HotsiteTemplateDraft> = {}): HotsiteTemplateDraft {
  return {
    branding: {
      brandName: IDENTITY.brandName,
      brandTagline: IDENTITY.tagline,
      logoUrl: TENANT_LOGO,
      primaryColor: '#123456',
      borderRadius: 'pill',
    },
    layout: [],
    seo: { title: 'Meu título', description: 'Minha descrição', ogImageUrl: 'tenants/x/og.png' },
    ...overrides,
  };
}

function apply(
  templateId: string,
  d: HotsiteTemplateDraft,
  maxBookingAdvanceDays = 365,
  locale: 'pt-BR' | 'en' = 'pt-BR',
) {
  return new HotsiteTemplateMaterializer().materialize({
    template: template(templateId, locale),
    draft: d,
    maxBookingAdvanceDays,
  });
}

function find(layout: HotsiteModule[], type: HotsiteModule['type']): HotsiteModule {
  const found = layout.find((candidate) => candidate.type === type);
  if (found === undefined) throw new Error(`no ${type} module`);
  return found;
}

describe('HotsiteTemplateMaterializer', () => {
  describe('branding', () => {
    it('takes palette and typography from the template and identity from the draft', () => {
      const result = apply('casa47', draft());

      expect(result.branding.primaryColor).toBe('#D3A655');
      expect(result.branding.borderRadius).toBe('sharp');
      expect(result.branding.brandName).toBe(IDENTITY.brandName);
      expect(result.branding.brandTagline).toBe(IDENTITY.tagline);
      expect(result.branding.logoUrl).toBe(TENANT_LOGO);
    });

    it('uses an empty logo when the draft has none', () => {
      const result = apply('casa47', draft({ branding: {} }));

      expect(result.branding.logoUrl).toBe('');
      expect(result.branding).not.toHaveProperty('brandName');
    });
  });

  describe('SEO', () => {
    it('keeps the draft SEO entirely', () => {
      const d = draft();

      expect(apply('beloauto', d).seo).toEqual(d.seo);
    });

    it('never sets an og image of its own', () => {
      expect(apply('beloauto', draft({ seo: { ...DEFAULT_HOTSITE_SEO } })).seo.ogImageUrl).toBe('');
    });
  });

  describe('layout', () => {
    it('follows the template: order, enabled set and variants', () => {
      const result = apply('lume-studio', draft());
      const expected = template('lume-studio').layout;

      expect(result.layout.map((m) => [m.type, m.enabled])).toEqual(
        expected.map((m) => [m.type, m.enabled]),
      );
    });

    it('replaces the draft layout instead of merging with it', () => {
      const d = draft({
        layout: [module('HERO', true, { title: 'Meu hero', variant: 'centered' })],
      });

      const hero = find(apply('casa47', d).layout, 'HERO');

      expect(hero.data).toMatchObject({ title: 'Seu estilo, no seu ritmo.' });
    });

    it('applying template B over template A keeps the same tenant data', () => {
      const first = apply(
        'casa47',
        draft({
          layout: [
            module('GALLERY', true, { images: TENANT_GALLERY }),
            module('TESTIMONIALS', true, { items: TENANT_TESTIMONIALS }),
          ],
        }),
      );

      const second = apply('lume-studio', {
        branding: first.branding,
        layout: first.layout,
        seo: first.seo,
      });

      expect(second.branding.brandName).toBe(IDENTITY.brandName);
      expect(second.branding.logoUrl).toBe(TENANT_LOGO);
      expect(second.seo).toEqual(first.seo);
      expect((find(second.layout, 'GALLERY').data as { images: unknown }).images).toEqual(
        TENANT_GALLERY,
      );
      expect((find(second.layout, 'TESTIMONIALS').data as { items: unknown }).items).toEqual(
        TENANT_TESTIMONIALS,
      );
    });

    it('is pure: the same input gives the same output', () => {
      const d = draft();

      expect(apply('origem', d)).toEqual(apply('origem', d));
    });

    it('does not mutate the draft or the template', () => {
      const d = draft({ layout: [module('GALLERY', true, { images: TENANT_GALLERY })] });
      const before = JSON.stringify(d);

      apply('mimo-pet', d);

      expect(JSON.stringify(d)).toBe(before);
    });
  });

  describe('LEAD_FORM and CHATBOT', () => {
    const draftLead = module('LEAD_FORM', true, { title: 'Meu formulário', ctaLabel: 'Enviar já' });
    const draftBot = module('CHATBOT', true, { variant: 'bubble', botName: 'Ana' });

    it('keeps the draft data and enabled state', () => {
      const result = apply('casa47', draft({ layout: [draftLead, draftBot] }));

      expect(find(result.layout, 'LEAD_FORM')).toMatchObject({
        enabled: true,
        data: { title: 'Meu formulário', ctaLabel: 'Enviar já' },
      });
      expect(find(result.layout, 'CHATBOT')).toMatchObject({
        enabled: true,
        data: { botName: 'Ana' },
      });
    });

    it('keeps a draft that switched them off, even when the template switches them on', () => {
      const off = [
        module('LEAD_FORM', false, { title: 'x', ctaLabel: 'y' }),
        module('CHATBOT', false, { variant: 'bubble' }),
      ];

      const result = apply('lume-studio', draft({ layout: off }));

      expect(find(result.layout, 'LEAD_FORM').enabled).toBe(false);
      expect(find(result.layout, 'CHATBOT').enabled).toBe(false);
    });

    it("uses the template's own default when the draft has neither", () => {
      const result = apply('lume-studio', draft());

      expect(find(result.layout, 'LEAD_FORM').enabled).toBe(true);
      expect(find(result.layout, 'CHATBOT').enabled).toBe(true);
    });

    it("keeps the template's presentation on the module while taking the draft's data", () => {
      const result = apply('lume-studio', draft({ layout: [draftLead] }));

      expect(find(result.layout, 'LEAD_FORM').presentation).toEqual(
        find(template('lume-studio').layout, 'LEAD_FORM').presentation,
      );
    });
  });

  describe('GALLERY images and TESTIMONIALS', () => {
    it("keeps the tenant's gallery images and uses the template's layout and title", () => {
      const result = apply(
        'casa47',
        draft({
          layout: [module('GALLERY', true, { images: TENANT_GALLERY, title: 'Meu título' })],
        }),
      );

      const gallery = find(result.layout, 'GALLERY').data as Record<string, unknown>;
      expect(gallery.images).toEqual(TENANT_GALLERY);
      expect(gallery.title).toBe('Detalhes da casa.');
      expect(gallery.layout).toBe('featured');
    });

    it("uses the template's sample gallery images when the draft has none", () => {
      const result = apply('casa47', draft({ layout: [module('GALLERY', true, { images: [] })] }));

      const images = (find(result.layout, 'GALLERY').data as { images: { url: string }[] }).images;
      expect(images.length).toBeGreaterThan(0);
      expect(
        images.every((image) => image.url.startsWith('shared/hotsite-templates/casa47/')),
      ).toBe(true);
    });

    it("keeps the tenant's testimonials and reports no samples applied", () => {
      const result = apply(
        'casa47',
        draft({ layout: [module('TESTIMONIALS', true, { items: TENANT_TESTIMONIALS })] }),
      );

      expect((find(result.layout, 'TESTIMONIALS').data as { items: unknown }).items).toEqual(
        TENANT_TESTIMONIALS,
      );
      expect(result.appliedSampleTestimonials).toBe(false);
    });

    it('applies the template sample testimonials, and says so, when the draft has none', () => {
      const result = apply(
        'casa47',
        draft({ layout: [module('TESTIMONIALS', true, { items: [] })] }),
      );

      expect(result.appliedSampleTestimonials).toBe(true);
      const items = (
        find(result.layout, 'TESTIMONIALS').data as { items: { authorName: string }[] }
      ).items;
      expect(items.length).toBeGreaterThan(0);
    });

    it('reports samples applied when the draft has no testimonials module at all', () => {
      expect(apply('casa47', draft()).appliedSampleTestimonials).toBe(true);
    });
  });

  describe('identity in copy', () => {
    it('never carries a template business name', () => {
      const json = JSON.stringify(apply('casa47', draft()).layout);

      expect(json).not.toMatch(/casa 47/i);
      expect(json).not.toContain('{{');
    });

    it('writes the tenant brand name where the copy asks for it', () => {
      const chatbot = find(apply('casa47', draft()).layout, 'CHATBOT').data as { botName: string };

      expect(chatbot.botName).toBe(IDENTITY.brandName);
    });
  });

  describe('fitting the template to the tenant', () => {
    it('lowers a carousel to the days the tenant lets customers book ahead', () => {
      const result = apply('casa47', draft(), 7);

      expect(
        (find(result.layout, 'BOOKING_CTA').data as { carouselDays: number }).carouselDays,
      ).toBe(7);
    });

    it('leaves a carousel alone when it already fits', () => {
      const result = apply('casa47', draft(), 365);

      expect(
        (find(result.layout, 'BOOKING_CTA').data as { carouselDays: number }).carouselDays,
      ).toBe(14);
    });

    it('points the header button at booking when the tenant keeps the lead form off', () => {
      const off = [module('LEAD_FORM', false, { title: 'x', ctaLabel: 'y' })];

      const nav = find(apply('lume-studio', draft({ layout: off })).layout, 'NAVIGATION').data as {
        cta: { target: string };
      };

      expect(nav.cta.target).toBe('booking-form');
    });

    it('keeps the lead-form button when the lead form is on', () => {
      const nav = find(apply('lume-studio', draft()).layout, 'NAVIGATION').data as {
        cta: { target: string };
      };

      expect(nav.cta.target).toBe('lead-form');
    });
  });

  describe('result validity', () => {
    it('fails with the existing layout error when a template cannot form a valid layout', () => {
      const broken: MaterializedTemplate = {
        ...template('casa47'),
        layout: [module('HERO', true, {}), find(template('casa47').layout, 'NAVIGATION')],
      };

      expect(() =>
        new HotsiteTemplateMaterializer().materialize({
          template: broken,
          draft: draft(),
          maxBookingAdvanceDays: 365,
        }),
      ).toThrow();
    });

    it('rejects a navigation item aimed at a module the layout disables', () => {
      const base = template('casa47');
      const broken: MaterializedTemplate = {
        ...base,
        layout: base.layout.map((m) => (m.type === 'ABOUT' ? { ...m, enabled: false } : m)),
      };

      expect(() =>
        new HotsiteTemplateMaterializer().materialize({
          template: broken,
          draft: draft(),
          maxBookingAdvanceDays: 365,
        }),
      ).toThrow(HotsiteNavigationTargetNotEnabledError);
    });
  });
});
