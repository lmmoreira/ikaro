import { describe, expect, it } from 'vitest';
import type { HotsiteModuleResponse } from '@ikaro/types';
import { buildTemplateManifest, CATALOGUE_TEMPLATE_IDS } from '@ikaro/hotsite-templates';
import { parseManifestJson, type ManifestDraft } from './manifest-schema';
import { buildHotsiteModuleRenderPlan, resolveHotsiteNavigation } from './page-model';

// The six catalogue templates (packages/hotsite-templates) are the source of truth for each
// composition: module order, enabled set, variants, presentation. Each is built through the same
// buildTemplateManifest the backend uses and parsed here exactly as the Manifesto tab parses a
// pasted manifest, so a definition that breaks the contract fails CI instead of failing a
// manager's paste. The backend side (request schema, aggregate cross-field rules, branding) is held
// by the package-adapter spec and hotsite-legacy-layouts.audit.spec.ts, which read the same data.
const IDENTITY = { brandName: 'Marca Exemplo', tagline: 'Slogan de exemplo' };

const TEMPLATES = [...CATALOGUE_TEMPLATE_IDS];

type TemplateId = (typeof TEMPLATES)[number];

function loadRaw(id: TemplateId): string {
  return JSON.stringify(buildTemplateManifest(id, 'pt-BR', IDENTITY));
}

function loadDraft(id: TemplateId): ManifestDraft {
  const result = parseManifestJson(loadRaw(id));
  if (!result.success) throw new Error(`${id}: ${result.error}`);
  return result.value;
}

function enabledModules(draft: ManifestDraft): HotsiteModuleResponse[] {
  return draft.layout.filter((module) => module.enabled);
}

// The "strong" module variants that give a composition its character: the TD56 additions plus the
// existing featured and masonry galleries the BeloAuto and Mimo Pet directions are built on.
const STRONG_VARIANTS = new Set([
  'featured',
  'masonry',
  'immersive',
  'numbered',
  'feature-cards',
  'editorial-quote',
  'portfolio',
  'editorial',
  'trust-grid',
  'process-steps',
  'collage-callout',
  'technical-callout',
  'image-statement',
  'immersive-statement',
]);

function strongVariants(draft: ManifestDraft): string[] {
  return enabledModules(draft).flatMap((module) =>
    [module.data.variant, module.data.layout].filter(
      (value): value is string => typeof value === 'string' && STRONG_VARIANTS.has(value),
    ),
  );
}

function presentationChoices(draft: ManifestDraft): string[] {
  return enabledModules(draft).flatMap((module) =>
    module.presentation ? [`${module.type}:${JSON.stringify(module.presentation)}`] : [],
  );
}

describe('template manifests', () => {
  it.each([
    ['casa47', 4, 'booking-form'],
    ['beloauto', 4, 'booking-form'],
    ['mimo-pet', 4, 'booking-form'],
    ['origem', 4, 'booking-form'],
    ['clinica-lume', 4, 'booking-form'],
    ['lume-studio', 3, 'lead-form'],
  ] as const)(
    '%s uses the reconciled gallery, About, CTA and footer capabilities',
    (name, count, target) => {
      const draft = loadDraft(name);
      const fixtureModule = (type: HotsiteModuleResponse['type']): HotsiteModuleResponse => {
        const found = draft.layout.find((item) => item.type === type);
        if (!found) throw new Error(`${name}: missing ${type}`);
        return found;
      };
      expect(fixtureModule('GALLERY').data.images).toHaveLength(count);
      expect(fixtureModule('GALLERY').data.layout).toBe('featured');
      expect(fixtureModule('ABOUT').data.variant).toBe('bleed');
      expect((fixtureModule('NAVIGATION').data.cta as { target: string }).target).toBe(target);
      expect(fixtureModule('FOOTER').presentation?.surface).toBe('custom');
    },
  );
  it('finds the six templates', () => {
    expect(TEMPLATES).toHaveLength(6);
  });

  describe.each(TEMPLATES)('%s', (id) => {
    it('parses with the full manifest schema', () => {
      const draft = loadDraft(id);

      expect(draft.layout.map((module) => module.type)).toHaveLength(12);
    });

    it('keeps NAVIGATION first and every navigation target on an enabled section', () => {
      const draft = loadDraft(id);

      expect(draft.layout[0].type).toBe('NAVIGATION');
      const enabledTypes = new Set(enabledModules(draft).map((module) => module.type));
      const targetType = {
        'service-list': 'SERVICE_LIST',
        gallery: 'GALLERY',
        testimonials: 'TESTIMONIALS',
        about: 'ABOUT',
        contact: 'CONTACT',
      } as const;
      const navigation = draft.layout[0];
      const items = (navigation.data.items ?? []) as { target: keyof typeof targetType }[];
      for (const item of items) {
        expect(enabledTypes.has(targetType[item.target])).toBe(true);
      }
    });

    it('renders every enabled section — none is dropped as malformed', () => {
      const draft = loadDraft(id);
      const sections = enabledModules(draft).filter((module) => module.type !== 'NAVIGATION');

      const plan = buildHotsiteModuleRenderPlan(
        draft.layout,
        draft.branding.alternateSectionBg ?? false,
        draft.branding,
      );

      expect(plan.map((item) => item.parsed.type)).toEqual(sections.map((module) => module.type));
    });

    it('resolves every configured navigation item (no dead link)', () => {
      const draft = loadDraft(id);
      const plan = buildHotsiteModuleRenderPlan(draft.layout, false, draft.branding);
      const navigation = draft.layout[0];
      const configured = (navigation.data.items ?? []) as unknown[];

      const resolved = navigation.enabled ? resolveHotsiteNavigation(draft.layout, plan) : [];

      expect(resolved).toHaveLength(navigation.enabled ? configured.length : 0);
    });

    it('never links service cards to a detail page (a new tenant’s services have no slug yet)', () => {
      const serviceList = loadDraft(id).layout.find((module) => module.type === 'SERVICE_LIST');

      expect(serviceList?.data.itemAction ?? 'none').not.toBe('details');
    });

    it('points its calls to action at sections that are enabled', () => {
      const draft = loadDraft(id);
      const enabledTypes = new Set(enabledModules(draft).map((module) => module.type));
      const targetType: Record<string, string> = {
        'booking-form': 'BOOKING_CTA',
        'service-list': 'SERVICE_LIST',
        gallery: 'GALLERY',
        testimonials: 'TESTIMONIALS',
        about: 'ABOUT',
        contact: 'CONTACT',
      };
      const hero = draft.layout.find((module) => module.type === 'HERO');
      for (const target of [hero?.data.ctaTarget, hero?.data.secondaryCtaTarget]) {
        if (typeof target === 'string') {
          expect(enabledTypes.has(targetType[target] as never)).toBe(true);
        }
      }
    });

    it('seeds no fictional tenant data: no logo, no service, no booking slot', () => {
      const draft = loadDraft(id);
      const raw = loadRaw(id);

      expect(draft.branding.logoUrl).toBe('');
      expect(raw).not.toMatch(/"(serviceId|bookingId|scheduledAt)"/);
    });

    it('demonstrates at least one strong variant and one presentation choice', () => {
      const draft = loadDraft(id);

      expect(strongVariants(draft).length).toBeGreaterThan(0);
      expect(presentationChoices(draft).length).toBeGreaterThan(0);
    });
  });

  // Distinct by composition, not by palette or imagery alone: module order, enabled set, a strong
  // variant and a presentation choice must each separate every template from every other.
  describe('the six compositions are distinct', () => {
    const drafts = TEMPLATES.map((id) => [id, loadDraft(id)] as const);

    function signatures(select: (draft: ManifestDraft) => string): string[] {
      return drafts.map(([, draft]) => select(draft));
    }

    it('differ by enabled module order', () => {
      const order = signatures((draft) =>
        enabledModules(draft)
          .map((module) => module.type)
          .join('>'),
      );

      expect(new Set(order).size).toBe(drafts.length);
    });

    // Two templates may enable the same set of modules: the prototype compositions themselves do
    // (BeloAuto and Mimo Pet both use hero, services, content block, about, gallery, testimonials,
    // booking, contact and footer). What keeps them apart is the ordered sequence above, the
    // content-block variant, the presentation choices and the palette — not the bare set.
    it('differ by their strong variants', () => {
      const variants = signatures((draft) => strongVariants(draft).sort().join(','));

      expect(new Set(variants).size).toBe(drafts.length);
    });

    it('differ by their presentation choices', () => {
      const choices = signatures((draft) => presentationChoices(draft).sort().join('|'));

      expect(new Set(choices).size).toBe(drafts.length);
    });

    it('differ by palette too, which alone would not have been enough', () => {
      const palettes = signatures((draft) => draft.branding.primaryColor);

      expect(new Set(palettes).size).toBe(drafts.length);
    });
  });
});
