import { HOTSITE_TEMPLATE_IDS } from '@ikaro/types';
import {
  HOTSITE_MODULE_TYPES,
  HotsiteBrandingSchema,
  HotsiteModuleSchema,
} from '@ikaro/validation';
import { z } from 'zod';
import { buildTemplateManifest } from './build-template-manifest';
import {
  CATALOGUE_TEMPLATE_IDS,
  getTemplateDefinition,
  isCatalogueTemplateId,
  listCatalogueDefinitions,
} from './catalogue';
import { TEMPLATE_LOCALES } from './types';

const IDENTITY = { brandName: 'Marca Exemplo', tagline: 'Slogan de exemplo' };
const LayoutSchema = z.array(HotsiteModuleSchema);

describe('template catalogue', () => {
  it('lists exactly the ids in the shared HOTSITE_TEMPLATE_IDS tuple, in the same order', () => {
    expect([...CATALOGUE_TEMPLATE_IDS]).toEqual([...HOTSITE_TEMPLATE_IDS]);
  });

  it('returns a definition whose id matches the id it is registered under', () => {
    for (const id of CATALOGUE_TEMPLATE_IDS) {
      expect(getTemplateDefinition(id).id).toBe(id);
      expect(getTemplateDefinition(id).version).toBeGreaterThanOrEqual(1);
    }
    expect(listCatalogueDefinitions().map((definition) => definition.id)).toEqual([
      ...CATALOGUE_TEMPLATE_IDS,
    ]);
  });

  it('recognises catalogue ids and rejects anything else', () => {
    expect(isCatalogueTemplateId('casa47')).toBe(true);
    expect(isCatalogueTemplateId('unknown')).toBe(false);
  });

  describe.each(CATALOGUE_TEMPLATE_IDS)('%s', (id) => {
    const definition = getTemplateDefinition(id);

    it('lists all twelve module types exactly once, NAVIGATION first', () => {
      const types = definition.layout.map((module) => module.type);
      expect([...types].sort()).toEqual([...HOTSITE_MODULE_TYPES].sort());
      expect(types[0]).toBe('NAVIGATION');
    });

    it('carries every presentation field a hotsite branding requires', () => {
      // The loader casts the JSON to TemplateBranding once; this is what makes that cast true.
      for (const field of [
        'primaryColor',
        'secondaryColor',
        'backgroundColor',
        'textColor',
        'headingFontFamily',
        'bodyFontFamily',
        'borderRadius',
        'buttonStyle',
        'spacing',
        'shadowStyle',
      ]) {
        expect(definition.branding).toHaveProperty(field);
      }
    });

    it('never sets tenant identity, logo, SEO or an og image', () => {
      expect(definition.branding).not.toHaveProperty('brandName');
      expect(definition.branding).not.toHaveProperty('brandTagline');
      expect(definition.branding).not.toHaveProperty('logoUrl');
      expect(definition).not.toHaveProperty('seo');
      expect(JSON.stringify(definition)).not.toContain('ogImageUrl');
    });

    it('never links a service card to a detail page a new tenant does not have', () => {
      const serviceList = definition.layout.find((module) => module.type === 'SERVICE_LIST');
      expect(serviceList?.data.itemAction).not.toBe('details');
    });

    it.each(TEMPLATE_LOCALES)('validates against the shared manifest schema in %s', (locale) => {
      const manifest = buildTemplateManifest(id, locale, IDENTITY);

      expect(LayoutSchema.safeParse(manifest.layout).success).toBe(true);
      expect(HotsiteBrandingSchema.safeParse(manifest.branding).success).toBe(true);
    });

    it.each(TEMPLATE_LOCALES)('still validates in %s for a tenant with no tagline', (locale) => {
      const manifest = buildTemplateManifest(id, locale, { brandName: 'X', tagline: '' });

      expect(LayoutSchema.safeParse(manifest.layout).success).toBe(true);
    });
  });
});
