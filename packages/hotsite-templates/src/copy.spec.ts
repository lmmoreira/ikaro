import type { HotsiteModuleResponse } from '@ikaro/types';
import { applyTemplateCopy } from './apply-copy';
import { buildTemplateManifest } from './build-template-manifest';
import { CATALOGUE_TEMPLATE_IDS, getTemplateCopy, getTemplateDefinition } from './catalogue';
import { TEMPLATE_LOCALES, TemplateCopyError } from './types';

const IDENTITY = { brandName: 'Marca Exemplo', tagline: 'Slogan de exemplo' };
const ALLOWED_PLACEHOLDERS = new Set(['{{brandName}}', '{{tagline}}']);

// Literal identities of the six prototype businesses and the people/places/years the old fixtures
// named. None may survive into a tenant's manifest.
const DENY_LIST = [
  'casa 47',
  'casa47',
  'belo auto',
  'mimo pet',
  'clínica lume',
  'lume studio',
  'lume',
  'origem',
  'são paulo',
  '2014',
  'rafael',
  'andré',
  'gustavo',
  'marcelo',
  'paulo',
  'carla',
  'marina',
  'joana',
  'paula',
  'camila',
  'bruno',
  'luana',
  'caio',
  'laís',
  'aurora',
  'noma',
  'estúdio norte',
  'theo',
  'nino',
];

function emptyTextLeaves(node: unknown, path: string[], out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => emptyTextLeaves(item, [...path, String(index)], out));
  } else if (typeof node === 'object' && node !== null) {
    Object.entries(node).forEach(([key, value]) => emptyTextLeaves(value, [...path, key], out));
  } else if (node === '') {
    out.push(path.join('.'));
  }
}

function emptyLeafKeys(layout: readonly HotsiteModuleResponse[]): string[] {
  const keys: string[] = [];
  for (const module of layout) emptyTextLeaves(module.data, [module.type], keys);
  return keys;
}

describe('template copy', () => {
  describe.each(CATALOGUE_TEMPLATE_IDS)('%s', (id) => {
    const definition = getTemplateDefinition(id);
    const ptBr = getTemplateCopy(id, 'pt-BR');
    const en = getTemplateCopy(id, 'en');

    it('has identical key sets in both locales', () => {
      expect(Object.keys(en).sort()).toEqual(Object.keys(ptBr).sort());
    });

    it('points every key at a text field the definition has, and every empty field has a key', () => {
      expect(emptyLeafKeys(definition.layout).sort()).toEqual(Object.keys(ptBr).sort());
    });

    it.each(TEMPLATE_LOCALES)('leaves no interpolation language behind in %s', (locale) => {
      const manifest = buildTemplateManifest(id, locale, IDENTITY);

      expect(JSON.stringify(manifest)).not.toContain('{{');
    });

    it.each(TEMPLATE_LOCALES)('uses only the two allowed placeholders in %s', (locale) => {
      const used = Object.values(getTemplateCopy(id, locale)).flatMap(
        (text) => text.match(/\{\{\w+\}\}/g) ?? [],
      );

      expect(used.every((placeholder) => ALLOWED_PLACEHOLDERS.has(placeholder))).toBe(true);
    });

    it.each(TEMPLATE_LOCALES)(
      'names no prototype business, person, place or year in %s',
      (locale) => {
        const haystack = JSON.stringify(getTemplateCopy(id, locale)).toLowerCase();

        for (const term of DENY_LIST) {
          expect(haystack).not.toMatch(new RegExp(`(^|[^\\p{L}\\d])${term}([^\\p{L}\\d]|$)`, 'u'));
        }
      },
    );

    it('interpolates the tenant identity where the copy asks for it', () => {
      const manifest = buildTemplateManifest(id, 'pt-BR', IDENTITY);
      const footer = manifest.layout.find((module) => module.type === 'FOOTER');

      expect(footer?.data.tagline).toBe(IDENTITY.tagline);
    });
  });

  describe('applyTemplateCopy', () => {
    const layout: HotsiteModuleResponse[] = [
      { type: 'HERO', enabled: true, data: { title: '', variant: 'centered' } },
    ];

    it('writes the copy into a copy of the layout and never mutates its input', () => {
      const result = applyTemplateCopy(layout, { 'HERO.title': 'Olá, {{brandName}}' }, IDENTITY);

      expect(result[0].data.title).toBe('Olá, Marca Exemplo');
      expect(layout[0].data.title).toBe('');
    });

    it('is pure: the same input gives the same output', () => {
      const copy = { 'HERO.title': '{{tagline}}' };

      expect(applyTemplateCopy(layout, copy, IDENTITY)).toEqual(
        applyTemplateCopy(layout, copy, IDENTITY),
      );
    });

    it('rejects an unknown placeholder', () => {
      expect(() => applyTemplateCopy(layout, { 'HERO.title': '{{city}}' }, IDENTITY)).toThrow(
        TemplateCopyError,
      );
    });

    it('rejects an unclosed interpolation left in the text', () => {
      expect(() => applyTemplateCopy(layout, { 'HERO.title': 'a {{ b' }, IDENTITY)).toThrow(
        TemplateCopyError,
      );
    });

    it('rejects a key for a module the definition does not have', () => {
      expect(() => applyTemplateCopy(layout, { 'ABOUT.title': 'x' }, IDENTITY)).toThrow(
        TemplateCopyError,
      );
    });

    it('rejects a key for a field the module does not have', () => {
      expect(() => applyTemplateCopy(layout, { 'HERO.subtitle': 'x' }, IDENTITY)).toThrow(
        TemplateCopyError,
      );
    });

    it('rejects a key that points at a non-text field', () => {
      expect(() => applyTemplateCopy(layout, { 'HERO.variant.x': 'x' }, IDENTITY)).toThrow(
        TemplateCopyError,
      );
    });

    it('rejects a key with no field path', () => {
      expect(() => applyTemplateCopy(layout, { HERO: 'x' }, IDENTITY)).toThrow(TemplateCopyError);
    });
  });
});
