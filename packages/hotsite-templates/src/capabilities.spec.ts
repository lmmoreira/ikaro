import type { HotsiteTemplateCapability, HotsiteTemplateId } from '@ikaro/types';
import { HOTSITE_TEMPLATE_CAPABILITIES } from '@ikaro/types';
import { deriveCapabilities } from './capabilities';
import { CATALOGUE_TEMPLATE_IDS, getTemplateDefinition } from './catalogue';
import { TemplateDefinition } from './types';

const PINNED: Readonly<Record<HotsiteTemplateId, HotsiteTemplateCapability[]>> = {
  beloauto: ['navigation', 'feature-card-services', 'technical-callout', 'icon-card-contact'],
  casa47: ['navigation', 'split-hero', 'image-statement'],
  'mimo-pet': ['navigation', 'feature-card-services', 'trust-grid', 'icon-card-contact'],
  origem: [
    'navigation',
    'immersive-statement',
    'numbered-services',
    'editorial-quote',
    'icon-card-contact',
  ],
  'clinica-lume': ['navigation', 'split-hero', 'process-steps', 'icon-card-contact', 'chatbot'],
  'lume-studio': [
    'navigation',
    'immersive-hero',
    'collage',
    'lead-form',
    'icon-card-contact',
    'chatbot',
  ],
};

describe('deriveCapabilities', () => {
  it.each(CATALOGUE_TEMPLATE_IDS)('pins the derived list of %s', (id) => {
    expect(deriveCapabilities(getTemplateDefinition(id))).toEqual(PINNED[id]);
  });

  it('only ever derives tokens from the closed shared set', () => {
    for (const id of CATALOGUE_TEMPLATE_IDS) {
      for (const token of deriveCapabilities(getTemplateDefinition(id))) {
        expect(HOTSITE_TEMPLATE_CAPABILITIES).toContain(token);
      }
    }
  });

  it('ignores a disabled module', () => {
    const definition: TemplateDefinition = {
      ...getTemplateDefinition('lume-studio'),
      layout: getTemplateDefinition('lume-studio').layout.map((module) => ({
        ...module,
        enabled: false,
      })),
    };

    expect(deriveCapabilities(definition)).toEqual([]);
  });

  it('derives no token for a module whose variant is not a showcase one', () => {
    const definition: TemplateDefinition = {
      ...getTemplateDefinition('casa47'),
      layout: [{ type: 'HERO', enabled: true, data: { variant: 'centered' } }],
    };

    expect(deriveCapabilities(definition)).toEqual([]);
  });
});
